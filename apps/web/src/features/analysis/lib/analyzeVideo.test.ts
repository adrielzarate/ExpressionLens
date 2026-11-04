import { expect, it, vi } from 'vitest'
import { mapProbabilities } from '@expressionlens/classifier'
import { analyzeVideo } from './analyzeVideo'
import type { AnalysisDependencies } from './analyzeVideo'
import type { ExpressionSample } from '../types'
import { sessionStatistics } from './statistics'

function setup() {
  const video = document.createElement('video')
  const source = {
    metadata: { durationMs: 1000, width: 640, height: 480 },
    frameAt: vi.fn(async () => video),
    dispose: vi.fn(),
  }
  const prediction = mapProbabilities(
    [0.55, 0.008, 0.002, 0.44],
    ['neutral', 'smile', 'surprise', 'angry'],
  )
  const analyzer = {
    modelVersion: 'v3',
    analyze: vi.fn(
      async (_frame: HTMLVideoElement, timestampMs: number): Promise<ExpressionSample> => ({
        status: 'detected',
        timestampMs,
        ...prediction,
      }),
    ),
    dispose: vi.fn(),
  }
  const deps: AnalysisDependencies = {
    createSource: vi.fn(async () => source),
    createAnalyzer: vi.fn(async () => analyzer),
    yieldControl: vi.fn(async () => {}),
  }
  return { video, source, analyzer, deps, prediction }
}
it('samples sequentially, preserves raw/uncertain probabilities, and releases one pair of resources', async () => {
  const { source, analyzer, deps, prediction } = setup()
  const progress = vi.fn()
  const session = await analyzeVideo('blob:test', new AbortController().signal, progress, 5, deps)
  expect(source.frameAt.mock.calls.map((call) => (call as unknown as [number])[0])).toEqual([
    0, 200, 400, 600, 800,
  ])
  expect(analyzer.analyze.mock.calls.map(([, timestamp]) => timestamp)).toEqual([
    0, 200, 400, 600, 800,
  ])
  expect(session.samples[0]).toEqual({ status: 'detected', timestampMs: 0, ...prediction })
  expect(session.source).toBe('upload')
  expect(session.durationMs).toBe(1000)
  expect(session.samples).toHaveLength(5)
  expect(progress.mock.calls.at(-1)?.[0]).toEqual({
    totalFrames: 5,
    processedFrames: 5,
    timestampMs: 800,
  })
  expect(source.dispose).toHaveBeenCalledOnce()
  expect(analyzer.dispose).toHaveBeenCalledOnce()
  expect(deps.createAnalyzer).toHaveBeenCalledOnce()
})
it('records no-face and multiple-faces separately from interpreted neural predictions', async () => {
  const { analyzer, deps } = setup()
  analyzer.analyze
    .mockResolvedValueOnce({ status: 'no-face', timestampMs: 0 })
    .mockResolvedValueOnce({ status: 'multiple-faces', timestampMs: 200 })
  const session = await analyzeVideo('blob:test', new AbortController().signal, vi.fn(), 5, deps)
  expect(session.samples[0]).toEqual({ status: 'no-face', timestampMs: 0 })
  const stats = sessionStatistics(session)
  expect(stats).toMatchObject({ total: 5, detected: 3, noFace: 1, multipleFaces: 1, coverage: 0.6 })
  expect(stats.counts.uncertain).toBe(3)
  expect(stats.counts.neutral).toBe(0)
  expect(stats.distribution.find((row) => row.label === 'uncertain')?.fraction).toBe(1)
})
it('waits for a pending inference before disposal, discards its stale result, and schedules no more frames after cancellation', async () => {
  const { analyzer, source, deps, prediction } = setup()
  let finish!: (sample: ExpressionSample) => void
  analyzer.analyze.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const controller = new AbortController(),
    progress = vi.fn()
  const running = analyzeVideo('blob:test', controller.signal, progress, 5, deps)
  await vi.waitFor(() => expect(analyzer.analyze).toHaveBeenCalledOnce())
  controller.abort()
  expect(analyzer.dispose).not.toHaveBeenCalled()
  finish({ status: 'detected', timestampMs: 0, ...prediction })
  await expect(running).rejects.toMatchObject({ name: 'AbortError' })
  expect(source.frameAt).toHaveBeenCalledOnce()
  expect(progress.mock.calls.at(-1)?.[0].processedFrames).toBe(0)
  expect(analyzer.dispose).toHaveBeenCalledOnce()
  expect(source.dispose).toHaveBeenCalledOnce()
  expect(
    (await analyzeVideo('blob:new', new AbortController().signal, vi.fn(), 5, deps)).samples,
  ).toHaveLength(5)
})
it.each(['source', 'model', 'seek', 'inference'] as const)(
  'cleans up and reports a %s failure',
  async (stage) => {
    const { analyzer, source, deps } = setup()
    if (stage === 'source')
      vi.mocked(deps.createSource).mockRejectedValueOnce(new Error('decoder failed'))
    if (stage === 'model')
      vi.mocked(deps.createAnalyzer).mockRejectedValueOnce(new Error('model failed'))
    if (stage === 'seek') source.frameAt.mockRejectedValueOnce(new Error('seek failed'))
    if (stage === 'inference') analyzer.analyze.mockRejectedValueOnce(new Error('inference failed'))
    await expect(
      analyzeVideo('blob:test', new AbortController().signal, vi.fn(), 5, deps),
    ).rejects.toThrow('Video analysis failed')
    if (stage !== 'source') expect(source.dispose).toHaveBeenCalledOnce()
    if (stage === 'seek' || stage === 'inference') expect(analyzer.dispose).toHaveBeenCalledOnce()
  },
)
it('does not initialize anything for an already cancelled job', async () => {
  const { deps } = setup(),
    controller = new AbortController()
  controller.abort()
  await expect(
    analyzeVideo('blob:test', controller.signal, vi.fn(), 5, deps),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(deps.createSource).not.toHaveBeenCalled()
  expect(deps.createAnalyzer).not.toHaveBeenCalled()
})
