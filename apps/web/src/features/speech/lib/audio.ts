import { mixToMono, SAMPLE_RATE } from './core'

export async function resampleMono(
  mono: Float32Array,
  sourceRate: number,
  create: (length: number, rate: number) => OfflineAudioContext = (length, rate) =>
    new OfflineAudioContext(1, length, rate),
): Promise<Float32Array> {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !mono.length)
    throw new Error('Invalid decoded sample rate or empty audio.')
  if (sourceRate === SAMPLE_RATE) return mono
  const length = Math.round((mono.length * SAMPLE_RATE) / sourceRate)
  if (!length) throw new Error('Audio is too short.')
  const context = create(length, SAMPLE_RATE)
  const buffer = context.createBuffer(1, mono.length, sourceRate)
  buffer.getChannelData(0).set(mono)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  try {
    source.start()
    const rendered = await context.startRendering()
    if (rendered.sampleRate !== SAMPLE_RATE || rendered.length !== length)
      throw new Error('Native resampling did not produce verified 16 kHz audio.')
    return new Float32Array(rendered.getChannelData(0))
  } finally {
    source.disconnect()
    source.buffer = null
  }
}
export async function prepareAudio(file: File) {
  if (!file.size || file.size > 250 * 1024 * 1024)
    throw new Error('Choose a nonempty media file up to 250 MiB.')
  const start = performance.now()
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    const decodeMs = performance.now() - start
    const durationMs = (decoded.length / decoded.sampleRate) * 1000
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 5 * 60 * 1000)
      throw new Error(
        'Audio analysis supports tracks up to five minutes. Start with 15–60 seconds.',
      )
    const preprocessingStart = performance.now()
    const mono = mixToMono(
      Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i)),
    )
    const audio = await resampleMono(mono, decoded.sampleRate)
    return {
      audio,
      durationMs,
      decodeMs,
      preprocessMs: performance.now() - preprocessingStart,
      inputBytes: audio.byteLength,
    }
  } finally {
    await context.close()
  }
}

export type PreparedAudio = Awaited<ReturnType<typeof prepareAudio>>
export function validateAudioDuration(audioDurationMs: number, durationMs: number) {
  if (Math.abs(audioDurationMs - durationMs) > Math.max(1000, durationMs * 0.02))
    throw new Error(
      'Decoded audio duration differs from the video timeline. Audio analysis cannot be safely synchronized.',
    )
}
