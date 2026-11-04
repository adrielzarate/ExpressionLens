import { throwIfAborted } from '../../analysis/lib/abort'
import type { PreparedAudio } from '../../speech/lib/audio'
import { ACTIVE_SER_MODEL } from '../config'
import { vocalModels } from '../models'
import type { SessionVocal } from '../types'
import { vocalError } from './core'
const WINDOW_SECONDS = 3
export async function analyzeVocal(
  file: File,
  durationMs: number,
  signal: AbortSignal,
  onStage: (message: string) => void,
  prepared?: PreparedAudio,
): Promise<SessionVocal> {
  throwIfAborted(signal)
  const selectedModel = vocalModels[ACTIVE_SER_MODEL]
  if (
    globalThis.isSecureContext === false ||
    typeof Worker === 'undefined' ||
    typeof AudioContext === 'undefined' ||
    typeof OfflineAudioContext === 'undefined'
  )
    throw new Error('Vocal analysis requires HTTPS, Web Workers and native audio decoding support.')
  const [{ VocalClient }, { prepareAudio, validateAudioDuration }] = await Promise.all([
    import('./client'),
    import('../../speech/lib/audio'),
  ])
  throwIfAborted(signal)
  // Prepare before loading the large model; reuse the shared decoded waveform when supplied.
  onStage('Preparing audio for vocal expression analysis…')
  const audio = prepared ?? (await prepareAudio(file))
  throwIfAborted(signal)
  validateAudioDuration(audio.durationMs, durationMs)
  const client = new VocalClient((message) => onStage(`Vocal expressions: ${message}`))
  const abandon = () => client.terminate()
  signal.addEventListener('abort', abandon, { once: true })
  let completed = false
  try {
    onStage(`Loading vocal expression model (${selectedModel.name})…`)
    const loaded = await client.request({ type: 'load', model: ACTIVE_SER_MODEL })
    throwIfAborted(signal)
    if (loaded.type !== 'ready' || loaded.labels.join(',') !== selectedModel.labels.join(','))
      throw new Error('Unexpected vocal model mapping.')
    onStage(`Analyzing vocal expressions (${WINDOW_SECONDS}-second windows)…`)
    const result = await client.request(
      { type: 'analyze', audio: audio.audio, seconds: WINDOW_SECONDS, silenceRms: 0.0001 },
      [audio.audio.buffer],
    )
    throwIfAborted(signal)
    if (result.type !== 'result') throw new Error('Unexpected vocal model response.')
    const samples = result.samples
      .filter((s) => s.startMs < durationMs)
      .map((s) => ({ ...s, endMs: Math.min(s.endMs, durationMs) }))
    const failed = samples.filter((s) => s.status === 'failed').length
    completed = true
    return {
      status: failed ? 'partial' : 'completed',
      samples,
      ...(failed ? { error: `${failed} vocal windows failed; other windows were retained.` } : {}),
      metadata: {
        modelId: selectedModel.manifest.modelId,
        revision: selectedModel.manifest.revision,
        dtype: selectedModel.dtype,
        preprocessing: selectedModel.preprocessing,
        backend: 'wasm',
        labels: loaded.labels,
        sampleRate: 16000,
        windowSeconds: WINDOW_SECONDS,
        stepMs: WINDOW_SECONDS * 1000,
        overlapMs: 0,
        silenceRms: 0.0001,
        audioDurationMs: audio.durationMs,
        loadMs: loaded.loadMs,
        inferenceMs: result.inferenceMs,
      },
    }
  } catch (cause) {
    if (signal.aborted) throw new DOMException('Vocal analysis cancelled.', 'AbortError')
    throw new Error(vocalError(cause))
  } finally {
    if (completed && !signal.aborted) {
      try {
        await client.request({ type: 'dispose' })
      } catch {
        /* Termination fallback. */
      }
    }
    signal.removeEventListener('abort', abandon)
    client.terminate()
  }
}
