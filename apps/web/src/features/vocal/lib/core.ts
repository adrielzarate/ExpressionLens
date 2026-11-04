export type WindowSeconds = 3 | 5 | 10
export interface VocalExpressionSample {
  startMs: number
  endMs: number
  predictedLabel: string | null
  scores: Record<string, number>
  margin: number | null
  status: 'classified' | 'silent' | 'too-short' | 'failed'
  error?: string
}
export interface WindowPlan {
  start: number
  end: number
  startMs: number
  endMs: number
}
export function segmentWindows(
  length: number,
  sampleRate: number,
  seconds: WindowSeconds,
): WindowPlan[] {
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    ![3, 5, 10].includes(seconds)
  )
    throw new Error('Invalid audio length, sample rate or window size.')
  const size = Math.round(sampleRate * seconds)
  if (size < 1) throw new Error('Invalid window sample count.')
  const windows: WindowPlan[] = []
  for (let start = 0; start < length; start += size) {
    const end = Math.min(length, start + size)
    windows.push({
      start,
      end,
      startMs: (start / sampleRate) * 1000,
      endMs: (end / sampleRate) * 1000,
    })
  }
  return windows
}
export function acousticRms(audio: Float32Array): number {
  if (!audio.length) return 0
  let mean = 0
  for (const value of audio) {
    if (!Number.isFinite(value)) throw new Error('PCM contains invalid values.')
    mean += value
  }
  mean /= audio.length
  let sum = 0
  for (const value of audio) sum += (value - mean) ** 2
  return Math.sqrt(sum / audio.length)
}
export function mapScores(
  output: unknown,
  labels: readonly string[],
): Pick<VocalExpressionSample, 'predictedLabel' | 'scores' | 'margin'> {
  if (
    !Array.isArray(output) ||
    output.length !== labels.length ||
    labels.length < 2 ||
    new Set(labels).size !== labels.length
  )
    throw new Error('Expected every configured model category.')
  const scores: Record<string, number> = Object.create(null)
  for (const row of output) {
    if (
      !row ||
      typeof row.label !== 'string' ||
      !labels.includes(row.label) ||
      Object.hasOwn(scores, row.label) ||
      typeof row.score !== 'number' ||
      !Number.isFinite(row.score) ||
      row.score < 0 ||
      row.score > 1
    )
      throw new Error('Invalid or duplicated model score.')
    scores[row.label] = row.score
  }
  if (Math.abs(Object.values(scores).reduce((a, b) => a + b, 0) - 1) > 0.001)
    throw new Error('Softmax scores must sum to one.')
  const ranked = [...labels].sort((a, b) => scores[b] - scores[a])
  return { scores, predictedLabel: ranked[0], margin: scores[ranked[0]] - scores[ranked[1]] }
}
export function activeWindow(samples: readonly VocalExpressionSample[], timeMs: number) {
  return samples.findIndex((row) => timeMs >= row.startMs && timeMs < row.endMs)
}
export async function analyzeWindows(
  audio: Float32Array,
  rate: number,
  seconds: WindowSeconds,
  silenceRms: number,
  labels: string[],
  classify: (window: Float32Array) => Promise<unknown>,
  progress: (done: number, total: number) => void,
  aborted: () => boolean = () => false,
  now = () => performance.now(),
) {
  if (!Number.isFinite(silenceRms) || silenceRms < 0 || silenceRms > 0.1)
    throw new Error('Invalid experimental silence threshold.')
  const windows = segmentWindows(audio.length, rate, seconds)
  if (!windows.length) throw new Error('Audio contains no PCM samples.')
  const samples: VocalExpressionSample[] = []
  let inferenceMs = 0,
    modelPreprocessMs = 0
  for (const window of windows) {
    if (aborted()) throw new DOMException('Vocal analysis abandoned.', 'AbortError')
    const started = now()
    const pcm = audio.subarray(window.start, window.end)
    const rms = acousticRms(pcm)
    modelPreprocessMs += now() - started
    const sample: VocalExpressionSample = {
      startMs: window.startMs,
      endMs: window.endMs,
      predictedLabel: null,
      scores: {},
      margin: null,
      status: 'too-short',
    }
    if (pcm.length / rate >= 0.5) {
      if (rms <= silenceRms) sample.status = 'silent'
      else {
        const inferStart = now()
        try {
          Object.assign(sample, mapScores(await classify(pcm), labels), { status: 'classified' })
        } catch (error) {
          sample.status = 'failed'
          sample.error = error instanceof Error ? error.message : String(error)
          if (/memory|allocation|out of bounds|device lost/i.test(sample.error))
            throw new Error(`SER runtime resource failure: ${sample.error}`)
        } finally {
          inferenceMs += now() - inferStart
        }
      }
    }
    if (aborted()) throw new DOMException('Vocal analysis abandoned.', 'AbortError')
    samples.push(sample)
    progress(samples.length, windows.length)
  }
  return { samples, inferenceMs, modelPreprocessMs }
}
export function vocalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/memory|allocation|out of bounds/i.test(message))
    return 'SER memory/runtime allocation failed. Abandon, close other tabs and try a shorter recording or smaller windows.'
  if (/decod|encoding|codec/i.test(message))
    return 'Native audio decoding failed: missing audio track, unsupported codec or corrupt media. Try a short WAV/MP3 or supported video.'
  return message
}
