import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createLivePredictor } from './livePredictor'
import { classifier, frame } from '../test/fixtures'
import type { PairedPrediction } from '../types/comparison'
import { emptySnapshot } from '../../../types/face'

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
it('pairs both predictions with the identical frame and skips overlapping/stale work', async () => {
  let resolve!: (values: number[]) => void
  const predict = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<number[]>((done) => {
          resolve = done
        }),
    )
    .mockResolvedValue([0.1, 0.7, 0.1, 0.1])
  const results: (PairedPrediction | null)[] = []
  const predictor = createLivePredictor((value) => results.push(value), vi.fn())
  predictor.configure(classifier(predict), 'disabled', true, true)
  const first = frame(0)
  predictor.frame(first)
  vi.advanceTimersByTime(100)
  predictor.frame(frame(100))
  vi.advanceTimersByTime(100)
  const latest = frame(200)
  predictor.frame(latest)
  expect(predict).toHaveBeenCalledOnce()
  resolve([0.1, 0.7, 0.1, 0.1])
  await flush()
  expect(predict).toHaveBeenCalledTimes(2)
  const predictions = results.filter((value): value is PairedPrediction => value !== null)
  expect(predictions[0].frame).toBe(first)
  expect(predictions[0].rule.label).toBe('Smile')
  expect(predictions[0].raw.label).toBe('smile')
  expect(predictions[predictions.length - 1].frame).toBe(latest)
  predictor.frame(latest)
  await flush()
  expect(predict).toHaveBeenCalledTimes(2)
  predictor.dispose()
})
it('clears immediately and never publishes a pending prediction after face loss, multiple faces, stop or unload', async () => {
  for (const mode of ['no-face', 'multiple', 'stop', 'unload'] as const) {
    let resolve!: (values: number[]) => void
    const predict = vi.fn(
      () =>
        new Promise<number[]>((done) => {
          resolve = done
        }),
    )
    const results = vi.fn()
    const model = classifier(predict)
    const controller = createLivePredictor(results, vi.fn())
    controller.configure(model, 'medium', true, true)
    controller.frame(frame(performance.now()))
    if (mode === 'no-face')
      controller.frame({ ...emptySnapshot(), timestampMs: performance.now(), faceDetected: false })
    if (mode === 'multiple') controller.frame({ ...frame(), faceCount: 2 })
    if (mode === 'stop') controller.configure(model, 'medium', true, false)
    if (mode === 'unload') controller.configure(null, 'medium', true, true)
    resolve([0.1, 0.7, 0.1, 0.1])
    await flush()
    expect(results.mock.calls.every(([value]) => value === null)).toBe(true)
    controller.dispose()
  }
})
it('does not infer while comparison is off or when no model is loaded', async () => {
  const predict = vi.fn().mockResolvedValue([0.1, 0.7, 0.1, 0.1])
  const controller = createLivePredictor(vi.fn(), vi.fn())
  controller.configure(classifier(predict), 'medium', false, true)
  controller.frame(frame())
  controller.configure(null, 'medium', true, true)
  controller.frame(frame())
  await flush()
  expect(predict).not.toHaveBeenCalled()
  controller.dispose()
})
