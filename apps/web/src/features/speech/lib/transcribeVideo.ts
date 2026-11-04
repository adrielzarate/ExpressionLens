import type { PreparedAudio } from './audio'
import { throwIfAborted } from '../../analysis/lib/abort'
import { describeError, MODEL_ID, normalizeTranscript } from './core'
import type { Language } from './core'
import type { SessionTranscription } from '../types'

// Loaded only after an explicit transcription request. Both acquisition workflows
// pass their completed File here; recording never starts speech inference.
export async function transcribeVideo(
  file: File,
  durationMs: number,
  language: Language,
  signal: AbortSignal,
  onStage: (message: string) => void,
  sharedAudio?: PreparedAudio,
): Promise<SessionTranscription> {
  throwIfAborted(signal)
  if (
    globalThis.isSecureContext === false ||
    typeof Worker === 'undefined' ||
    typeof AudioContext === 'undefined' ||
    typeof OfflineAudioContext === 'undefined'
  )
    throw new Error(
      'Speech transcription requires HTTPS, Web Workers and native AudioContext/OfflineAudioContext support in this browser.',
    )
  const [{ SpeechClient }, { prepareAudio }] = await Promise.all([
    import('./client'),
    import('./audio'),
  ])
  throwIfAborted(signal)
  const client = new SpeechClient(onStage)
  const abandon = () => client.terminate()
  signal.addEventListener('abort', abandon, { once: true })
  let completed = false
  try {
    onStage('Loading multilingual Whisper on WASM…')
    const loaded = await client.request({ type: 'load', backend: 'wasm' })
    throwIfAborted(signal)
    if (loaded.type !== 'ready') throw new Error('Unexpected speech model loading response.')
    onStage('Decoding local audio and preparing 16 kHz mono input…')
    const prepared = sharedAudio ?? (await prepareAudio(file))
    throwIfAborted(signal)
    // Avoid attaching a decoded track with a different duration to this video.
    // Native encoder padding can differ slightly; no timestamps are stretched.
    if (Math.abs(prepared.durationMs - durationMs) > Math.max(1000, durationMs * 0.02))
      throw new Error(
        'Decoded audio duration differs from the video timeline. Transcription cannot be safely synchronized.',
      )
    onStage('Transcribing speech locally (30-second windows)…')
    const audio = sharedAudio ? prepared.audio.slice() : prepared.audio
    const response = await client.request({ type: 'transcribe', audio, language }, [audio.buffer])
    throwIfAborted(signal)
    if (response.type !== 'result') throw new Error('Unexpected speech model response.')
    const normalized = normalizeTranscript(
      response.output,
      Math.min(durationMs, prepared.durationMs),
    )
    completed = true
    return {
      ...normalized,
      status: 'completed',
      selectedLanguage: language,
      detectedLanguage: null,
      metadata: {
        modelId: MODEL_ID,
        backend: 'wasm',
        inferenceMs: response.inferenceMs,
        loadMs: loaded.loadMs,
        audioDurationMs: prepared.durationMs,
      },
    }
  } catch (error) {
    if (signal.aborted)
      throw new DOMException(
        'Speech processing abandoned; browser resource cleanup may finish later.',
        'AbortError',
      )
    throw new Error(describeError(error))
  } finally {
    // Dispose idle sessions normally; failed/abandoned native runtimes are also
    // terminated. No second model is retained between facial/speech operations.
    if (completed && !signal.aborted) {
      try {
        await client.request({ type: 'dispose' })
      } catch {
        /* Worker termination below is the fallback. */
      }
    }
    signal.removeEventListener('abort', abandon)
    client.terminate()
  }
}
