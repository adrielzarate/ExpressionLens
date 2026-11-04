export const MODEL_ID = 'onnx-community/whisper-tiny'
export const SAMPLE_RATE = 16000
export type Backend = 'wasm' | 'webgpu'
export type Language = 'english' | 'spanish' | 'auto'
export interface TranscriptSegment {
  startMs: number
  endMs: number
  text: string
}
export interface TranscriptionResult {
  text: string
  segments: TranscriptSegment[]
  language: string | null
  modelId: string
  backend: Backend
  timestampWarning?: string
}
export interface Measurements {
  decodeMs: number
  preprocessMs: number
  inferenceMs: number
  totalMs: number
  durationMs: number
  inputBytes: number
}
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  if (
    !channels.length ||
    !channels[0].length ||
    channels.some((c) => c.length !== channels[0].length)
  )
    throw new Error('Audio channels must be nonempty and have equal lengths.')
  const result = new Float32Array(channels[0].length)
  for (let i = 0; i < result.length; i++) {
    let sum = 0
    for (const channel of channels) {
      if (!Number.isFinite(channel[i])) throw new Error('Audio contains invalid samples.')
      sum += channel[i]
    }
    result[i] = sum / channels.length
  }
  return result
}
export function realTimeFactor(inferenceMs: number, durationMs: number): number | null {
  return Number.isFinite(inferenceMs) &&
    inferenceMs >= 0 &&
    Number.isFinite(durationMs) &&
    durationMs > 0
    ? inferenceMs / durationMs
    : null
}
export function normalizeTranscript(
  output: unknown,
  durationMs: number,
  offsetMs = 0,
): Pick<TranscriptionResult, 'text' | 'segments' | 'timestampWarning'> {
  if (
    !output ||
    typeof output !== 'object' ||
    !('text' in output) ||
    typeof output.text !== 'string'
  )
    throw new Error('The model returned an invalid transcript.')
  const text = output.text.trim()
  const invalid = () => ({
    text,
    segments: [],
    timestampWarning:
      'Segment timestamps are missing or invalid. Text is available; synchronized segments are unavailable.',
  })
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(offsetMs) || offsetMs < 0)
    throw new Error('Invalid audio duration or chunk offset.')
  if (!('chunks' in output) || !Array.isArray(output.chunks) || !output.chunks.length)
    return invalid()
  const segments: TranscriptSegment[] = []
  let previousEnd = offsetMs
  for (const chunk of output.chunks) {
    if (
      !chunk ||
      typeof chunk.text !== 'string' ||
      !Array.isArray(chunk.timestamp) ||
      chunk.timestamp.length !== 2
    )
      return invalid()
    const [start, end]: unknown[] = chunk.timestamp
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isFinite(start) ||
      !Number.isFinite(end)
    )
      return invalid()
    const startMs = Math.round(start * 1000) + offsetMs
    const endMs = Math.round(end * 1000) + offsetMs
    if (
      start < 0 ||
      end <= start ||
      startMs < previousEnd ||
      endMs > durationMs ||
      endMs <= startMs
    )
      return invalid()
    previousEnd = endMs
    if (chunk.text.trim()) segments.push({ startMs, endMs, text: chunk.text.trim() })
  }
  return { text, segments }
}
export interface CapabilityHost {
  isSecureContext: boolean
  Worker?: unknown
  WebAssembly?: unknown
  AudioContext?: unknown
  OfflineAudioContext?: unknown
  navigator: { gpu?: { requestAdapter(): Promise<unknown> } }
}
export async function detectCapabilities(host: CapabilityHost) {
  const wasm =
    host.isSecureContext &&
    !!host.Worker &&
    !!host.WebAssembly &&
    !!host.AudioContext &&
    !!host.OfflineAudioContext
  let webgpu = false
  if (wasm && host.navigator.gpu) {
    try {
      webgpu = !!(await host.navigator.gpu.requestAdapter())
    } catch {
      /* WASM remains available. */
    }
  }
  return {
    wasm,
    webgpu,
    reason: wasm
      ? 'Native audio decoding, Worker and WASM available.'
      : 'Requires HTTPS, Web Workers, WebAssembly, AudioContext and OfflineAudioContext.',
  }
}
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/duration differs from the video timeline/i.test(message)) return message
  if (/out of memory|allocation|memory access|oom/i.test(message))
    return 'Memory allocation failed. Try a shorter file, close other tabs, then reload the model.'
  if (/decode|encodingerror|codec|format/i.test(message))
    return 'Native audio decoding failed. This file may have no audio or an unsupported codec. Try WAV, MP3 or a browser-supported MP4/WebM.'
  return `${message}. If model loading failed, check that the application server includes all local Whisper assets. For an unsupported WebGPU/model combination, abandon and explicitly load WASM.`
}
