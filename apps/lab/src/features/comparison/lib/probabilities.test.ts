import { expect, it } from 'vitest'
import { featureNames } from '../../dataset/lib/featureSchema'
import { orderedFeatures, mapProbabilities } from './probabilities'

it('orders coefficients by model feature names instead of the MediaPipe array order', () => {
  const shapes = featureNames.map((name, index) => ({ name, score: index / 100 })).reverse()
  expect(orderedFeatures(shapes, featureNames)).toEqual(featureNames.map((_, index) => index / 100))
  expect(() => orderedFeatures(shapes.slice(1), featureNames)).toThrow('52')
  expect(() =>
    orderedFeatures([{ name: 'invalid', score: 0 }, ...shapes.slice(1)], featureNames),
  ).toThrow('Missing')
  expect(() =>
    orderedFeatures([{ ...shapes[0], score: NaN }, ...shapes.slice(1)], featureNames),
  ).toThrow('Invalid')
})
it('maps probabilities using supplied metadata labels, never positional label literals', () => {
  const prediction = mapProbabilities(
    [0.1, 0.6, 0.2, 0.1],
    ['angry', 'surprise', 'neutral', 'smile'],
  )
  expect(prediction.label).toBe('surprise')
  expect(prediction.confidence).toBe(0.6)
  expect(prediction.distribution[0]).toEqual({ label: 'angry', probability: 0.1 })
})
it.each([
  [0.1, 0.2],
  [NaN, 0, 0, 1],
  [0, 0, 0, 0],
  [-0.1, 0.1, 0, 1],
])('rejects invalid probabilities %j', (...values) => {
  expect(() => mapProbabilities(values, ['neutral', 'smile', 'surprise', 'angry'])).toThrow(
    'four finite',
  )
})

it.each([
  { values: [0.55, 0.008, 0.002, 0.44], raw: 'neutral', uncertain: true },
  { values: [0.8, 0.01, 0.01, 0.18], raw: 'neutral', uncertain: false },
  { values: [0.55, 0.4, 0.03, 0.02], raw: 'neutral', uncertain: false },
  { values: [0.575, 0.425, 0, 0], raw: 'neutral', uncertain: false },
  { values: [0.5749, 0.4251, 0, 0], raw: 'neutral', uncertain: true },
  { values: [0.01, 0.5, 0.48, 0.01], raw: 'smile', uncertain: true },
  { values: [0.01, 0.35, 0.63, 0.01], raw: 'surprise', uncertain: false },
  { values: [0.01, 0.48, 0.5, 0.01], raw: 'surprise', uncertain: true },
  { values: [0.5, 0, 0, 0.5], raw: 'neutral', uncertain: true },
])(
  'interprets top-two margins without changing raw output: $values',
  ({ values, raw, uncertain }) => {
    const original = [...values]
    const prediction = mapProbabilities(values, ['neutral', 'smile', 'surprise', 'angry'])
    expect(prediction.rawLabel).toBe(raw)
    expect(prediction.label).toBe(uncertain ? 'uncertain' : raw)
    expect(prediction.isUncertain).toBe(uncertain)
    const sorted = [...values].sort((a, b) => b - a)
    expect(prediction.confidence).toBe(sorted[0])
    expect(prediction.margin).toBeCloseTo(sorted[0] - sorted[1])
    expect(prediction.distribution.map((row) => row.probability)).toEqual(original)
    expect(prediction.distribution.map((row) => row.label)).toEqual([
      'neutral',
      'smile',
      'surprise',
      'angry',
    ])
    expect(values).toEqual(original)
  },
)
