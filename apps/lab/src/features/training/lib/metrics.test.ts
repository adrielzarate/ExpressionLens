import { expect, it } from 'vitest'
import { classificationMetrics } from './metrics'

it('computes actual-row/predicted-column confusion, test accuracy and macro-F1 independently', () => {
  const metrics = classificationMetrics([0, 0, 1, 1, 2, 2, 3, 3], [0, 1, 1, 1, 2, 3, 3, 0])
  expect(metrics.confusionMatrix).toEqual([
    [1, 1, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 1, 1],
    [1, 0, 0, 1],
  ])
  expect(metrics.sampleCount).toBe(8)
  expect(metrics.accuracy).toBe(5 / 8)
  expect(metrics.perClass.map((row) => row.label)).toEqual([
    'neutral',
    'smile',
    'surprise',
    'angry',
  ])
  expect(metrics.perClass[1].precision).toBeCloseTo(2 / 3)
  expect(metrics.perClass[1].recall).toBe(1)
  expect(metrics.perClass[1].f1).toBeCloseTo(0.8)
  expect(metrics.macroF1).toBeCloseTo((0.5 + 0.8 + 2 / 3 + 0.5) / 4)
})
it('handles absent predictions without NaN and includes all four classes in macro-F1', () => {
  const metrics = classificationMetrics([0, 1, 2, 3], [0, 0, 0, 0])
  expect(metrics.perClass[1]).toMatchObject({ precision: 0, recall: 0, f1: 0, support: 1 })
  expect(metrics.macroF1).toBeCloseTo(0.1)
  expect(classificationMetrics([0, 1, 2, 3], [0, 1, 2, 3]).macroF1).toBe(1)
})
it('rejects empty, mismatched or invalid labels', () => {
  expect(() => classificationMetrics([], [])).toThrow()
  expect(() => classificationMetrics([0], [0, 1])).toThrow()
  expect(() => classificationMetrics([4], [0])).toThrow()
  expect(() => classificationMetrics([0], [NaN])).toThrow()
})
