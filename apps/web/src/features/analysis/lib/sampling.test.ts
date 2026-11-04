import { expect, it } from 'vitest'
import { ANALYSIS_FPS, samplingPlan } from './sampling'

it.each([
  { duration: 1000, fps: 5, expected: [0, 200, 400, 600, 800] },
  { duration: 1001, fps: 5, expected: [0, 200, 400, 600, 800, 1000] },
  { duration: 10, fps: 5, expected: [0] },
  { duration: 1000, fps: 2, expected: [0, 500] },
])(
  'generates unique chronological timestamps strictly before duration $duration',
  ({ duration, fps, expected }) => {
    const plan = samplingPlan(duration, fps)
    const timestamps = Array.from({ length: plan.totalFrames }, (_, i) => plan.timestampAt(i))
    expect(timestamps).toEqual(expected)
    expect(new Set(timestamps).size).toBe(timestamps.length)
    expect(timestamps.every((value) => value < duration)).toBe(true)
    expect(ANALYSIS_FPS).toBe(5)
  },
)
it('rejects unavailable duration or invalid sample rates', () => {
  for (const duration of [0, -1, Infinity, NaN]) expect(() => samplingPlan(duration)).toThrow()
  for (const fps of [0, -1, Infinity, NaN, 61]) expect(() => samplingPlan(1000, fps)).toThrow()
})
