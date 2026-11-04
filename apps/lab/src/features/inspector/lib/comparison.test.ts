import { describe, expect, it } from 'vitest'
import { blendshapeGroup, compareVectors, meanVector } from './comparison'
import { featureNames } from '../../dataset/lib/featureSchema'
const vector = (v = 0) => Array<number>(52).fill(v)
describe('inspector descriptive diagnostics', () => {
  it('computes all differences, stable top ten, MAD, Euclidean and cosine', () => {
    const a = vector(),
      b = vector()
    a[0] = 1
    b[1] = 1
    const result = compareVectors(a, b)
    expect(result.meanAbsoluteDifference).toBeCloseTo(2 / 52)
    expect(result.euclideanDistance).toBeCloseTo(Math.sqrt(2))
    expect(result.cosineSimilarity).toBe(0)
    expect(result.rows[0]).toEqual({ name: featureNames[0], a: 1, b: 0, difference: 1 })
    expect(result.top).toHaveLength(10)
    expect(result.top.slice(0, 2).every((row) => row.difference === 1)).toBe(true)
    expect(compareVectors(a, a).cosineSimilarity).toBe(1)
  })
  it('handles identical and zero vectors without inventing a cosine value', () => {
    const result = compareVectors(vector(), vector())
    expect(result.meanAbsoluteDifference).toBe(0)
    expect(result.euclideanDistance).toBe(0)
    expect(result.cosineSimilarity).toBeNull()
  })
  it('computes group means without mutating captures', () => {
    const a = vector(0.2),
      b = vector(0.8)
    expect(meanVector([a, b])).toEqual(vector(0.5))
    expect(a).toEqual(vector(0.2))
    expect(compareVectors(meanVector([a, b]), vector(0.5)).meanAbsoluteDifference).toBe(0)
  })
  it('rejects malformed vectors and empty groups', () => {
    for (const bad of [[], vector(NaN), vector(Infinity), vector(-0.1), vector(1.1)]) {
      expect(() => compareVectors(bad, vector())).toThrow('52 finite')
      expect(() => meanVector([bad])).toThrow()
    }
    expect(() => meanVector([])).toThrow('at least one')
  })
  it('groups actual MediaPipe names by region, including the neutral coefficient', () => {
    expect(
      [
        'browDownLeft',
        'eyeSquintRight',
        'mouthStretchLeft',
        'jawOpen',
        'cheekPuff',
        'noseSneerLeft',
        '_neutral',
      ].map(blendshapeGroup),
    ).toEqual(['Eyebrows', 'Eyes', 'Mouth', 'Jaw', 'Cheeks', 'Nose', 'Other'])
  })
})
