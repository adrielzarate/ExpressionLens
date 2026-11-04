import { expect, it, vi } from 'vitest'
import { acousticRms, activeWindow, analyzeWindows, mapScores, segmentWindows } from './core'
const labels = ['neu', 'hap', 'ang', 'sad']
const output = [
  { label: 'hap', score: 0.6 },
  { label: 'neu', score: 0.2 },
  { label: 'sad', score: 0.15 },
  { label: 'ang', score: 0.05 },
]
const pcm = (seconds: number) =>
  Float32Array.from({ length: 16000 * seconds }, (_, i) => Math.sin(i * 0.1) * 0.1)
it.each([3, 5, 10] as const)(
  'segments %s-second windows without overlap or timestamp drift, including the real tail',
  (seconds) => {
    const windows = segmentWindows(16000 * (seconds * 2 + 0.25), 16000, seconds)
    expect(windows).toHaveLength(3)
    expect(windows[0]).toEqual({
      start: 0,
      end: 16000 * seconds,
      startMs: 0,
      endMs: seconds * 1000,
    })
    expect(windows[1].startMs).toBe(windows[0].endMs)
    expect(windows[2].endMs).toBe((seconds * 2 + 0.25) * 1000)
  },
)
it('handles empty/invalid segmentation and silence/DC/nonfinite PCM', () => {
  expect(segmentWindows(0, 16000, 5)).toEqual([])
  expect(() => segmentWindows(-1, 16000, 5)).toThrow()
  expect(() => segmentWindows(10, 0, 5)).toThrow()
  expect(acousticRms(new Float32Array(10))).toBe(0)
  expect(acousticRms(new Float32Array(10).fill(0.5))).toBe(0)
  expect(() => acousticRms(new Float32Array([NaN]))).toThrow()
})
it('maps all configured labels without softmaxing probabilities again or assuming output order', () => {
  const result = mapScores(output, labels)
  expect(result.predictedLabel).toBe('hap')
  expect(result.margin).toBeCloseTo(0.4)
  expect(result.scores).toEqual({ neu: 0.2, hap: 0.6, ang: 0.05, sad: 0.15 })
  expect(output[0].score).toBe(0.6)
  for (const invalid of [
    output.slice(1),
    [...output.slice(1), output[1]],
    output.map((x) => ({ ...x, label: 'unknown' })),
    output.map((x) => ({ ...x, score: 2 })),
    output.map((x) => ({ ...x, score: NaN })),
  ])
    expect(() => mapScores(invalid, labels)).toThrow()
})
it('classifies sequentially with every score while marking a short tail unclassified', async () => {
  const classify = vi.fn(async () => output),
    progress = vi.fn()
  const result = await analyzeWindows(pcm(6.25), 16000, 3, 0.0001, labels, classify, progress)
  expect(classify).toHaveBeenCalledTimes(2)
  expect(result.samples.map((x) => x.status)).toEqual(['classified', 'classified', 'too-short'])
  expect(result.samples[2]).toMatchObject({
    startMs: 6000,
    endMs: 6250,
    predictedLabel: null,
    scores: {},
    margin: null,
  })
  expect(progress).toHaveBeenLastCalledWith(3, 3)
})
it('skips silent audio before model normalization and never invents predictions for empty input', async () => {
  const classify = vi.fn()
  const result = await analyzeWindows(
    new Float32Array(16000 * 3),
    16000,
    3,
    0.0001,
    labels,
    classify,
    vi.fn(),
  )
  expect(classify).not.toHaveBeenCalled()
  expect(result.samples[0]).toMatchObject({ status: 'silent', predictedLabel: null, scores: {} })
  await expect(
    analyzeWindows(new Float32Array(), 16000, 3, 0, labels, classify, vi.fn()),
  ).rejects.toThrow('no PCM')
})
it('records per-window failures and continues without inventing a label', async () => {
  const classify = vi
    .fn()
    .mockRejectedValueOnce(new Error('unsupported input'))
    .mockResolvedValueOnce(output)
  const result = await analyzeWindows(pcm(6), 16000, 3, 0.0001, labels, classify, vi.fn())
  expect(result.samples[0]).toMatchObject({
    status: 'failed',
    predictedLabel: null,
    scores: {},
    error: 'unsupported input',
  })
  expect(result.samples[1].status).toBe('classified')
})
it('abandons before work and ignores results after an in-flight operation; resource errors fail clearly', async () => {
  const classify = vi.fn(async () => output),
    progress = vi.fn()
  await expect(
    analyzeWindows(pcm(3), 16000, 3, 0, labels, classify, progress, () => true),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(classify).not.toHaveBeenCalled()
  let cancelled = false
  await expect(
    analyzeWindows(
      pcm(3),
      16000,
      3,
      0,
      labels,
      async () => {
        cancelled = true
        return output
      },
      progress,
      () => cancelled,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(progress).not.toHaveBeenCalled()
  await expect(
    analyzeWindows(
      pcm(3),
      16000,
      3,
      0,
      labels,
      async () => {
        throw new Error('out of memory')
      },
      progress,
    ),
  ).rejects.toThrow('resource failure')
})
it('uses start-inclusive/end-exclusive intervals and has no active interval outside the media', () => {
  const samples = [
    {
      startMs: 0,
      endMs: 3000,
      predictedLabel: null,
      scores: {},
      margin: null,
      status: 'silent' as const,
    },
    {
      startMs: 3000,
      endMs: 3500,
      predictedLabel: null,
      scores: {},
      margin: null,
      status: 'too-short' as const,
    },
  ]
  expect(activeWindow(samples, 2999)).toBe(0)
  expect(activeWindow(samples, 3000)).toBe(1)
  expect(activeWindow(samples, 3500)).toBe(-1)
  expect(activeWindow(samples, -1)).toBe(-1)
})
