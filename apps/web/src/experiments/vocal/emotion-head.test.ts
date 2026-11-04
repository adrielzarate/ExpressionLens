import { expect, it } from 'vitest'
import { classifyFeatures, parseHead } from './emotion-head'
const head = () => ({
  labels: [
    'angry',
    'disgusted',
    'fearful',
    'happy',
    'neutral',
    'other',
    'sad',
    'surprised',
    'unknown',
  ],
  weight: Array.from({ length: 9 }, () => Array(768).fill(0)),
  bias: Array(9).fill(0),
})
it('validates the nine-class 768-feature published head', () => {
  expect(parseHead(head()).labels).toHaveLength(9)
  expect(() => parseHead({ ...head(), weight: [[NaN]] })).toThrow('Invalid')
  expect(() => parseHead({ ...head(), labels: Array(9).fill('neutral') })).toThrow('Invalid')
})
it('mean pools frames and applies the linear head followed by one stable softmax', () => {
  const h = head()
  h.weight[0][0] = 1
  h.bias.fill(1000)
  const features = new Float32Array(1536)
  features[0] = 1
  features[768] = 3
  const result = classifyFeatures(features, 2, h)
  expect(result[0].score).toBeCloseTo(Math.exp(2) / (Math.exp(2) + 8), 12)
  expect(result.map((x) => x.label)).toEqual(h.labels)
  expect(result.reduce((s, x) => s + x.score, 0)).toBeCloseTo(1, 12)
  expect(features[768]).toBe(3)
})
it('rejects malformed and nonfinite encoder outputs', () => {
  expect(() => classifyFeatures(new Float32Array(768), 2, head())).toThrow('dimensions')
  const values = new Float32Array(768)
  values[0] = NaN
  expect(() => classifyFeatures(values, 1, head())).toThrow('Non-finite')
})
