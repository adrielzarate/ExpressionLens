import { expect, it } from 'vitest'
import { createSmoother } from './smoothing'

it('returns raw values when disabled and does not mutate input arrays', () => {
  const smoother = createSmoother(),
    values = [0, 1, 0, 0]
  expect(smoother.apply([1, 0, 0, 0], 'disabled', 0)).toEqual([1, 0, 0, 0])
  expect(smoother.apply(values, 'disabled', 100)).toEqual(values)
  expect(values).toEqual([0, 1, 0, 0])
})
it('uses immediate EMA updates with increasing smoothing strength', () => {
  for (const [level, alpha] of [
    ['low', 0.8],
    ['medium', 0.5],
    ['high', 0.3],
  ] as const) {
    const smoother = createSmoother()
    smoother.apply([1, 0, 0, 0], level, 0)
    const next = smoother.apply([0, 1, 0, 0], level, 100)
    expect(next[1]).toBe(alpha)
    expect(next.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
  }
})
it('resets on a meaningful face-loss gap, explicit reset or a changed level', () => {
  const smoother = createSmoother()
  smoother.apply([1, 0, 0, 0], 'high', 0)
  expect(smoother.apply([0, 1, 0, 0], 'high', 600)).toEqual([0, 1, 0, 0])
  smoother.reset()
  expect(smoother.apply([0, 0, 1, 0], 'high', 700)).toEqual([0, 0, 1, 0])
  expect(smoother.apply([1, 0, 0, 0], 'low', 800)).toEqual([1, 0, 0, 0])
})
