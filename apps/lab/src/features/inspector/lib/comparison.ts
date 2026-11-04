import { featureNames } from '../../dataset/lib/featureSchema'

export function validateVector(values: unknown): asserts values is number[] {
  if (
    !Array.isArray(values) ||
    values.length !== 52 ||
    values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)
  )
    throw new Error('Expected 52 finite coefficients within [0,1].')
}
export function compareVectors(a: number[], b: number[]) {
  validateVector(a)
  validateVector(b)
  const rows = featureNames.map((name, i) => ({
    name,
    a: a[i],
    b: b[i],
    difference: Math.abs(a[i] - b[i]),
  }))
  const squared = rows.reduce((sum, row) => sum + row.difference ** 2, 0)
  const dot = a.reduce((sum, value, i) => sum + value * b[i], 0)
  const norm =
    Math.sqrt(a.reduce((sum, v) => sum + v * v, 0)) *
    Math.sqrt(b.reduce((sum, v) => sum + v * v, 0))
  return {
    rows,
    top: [...rows]
      .sort((x, y) => y.difference - x.difference || x.name.localeCompare(y.name))
      .slice(0, 10),
    meanAbsoluteDifference: rows.reduce((sum, row) => sum + row.difference, 0) / 52,
    euclideanDistance: Math.sqrt(squared),
    cosineSimilarity: norm === 0 ? null : Math.min(1, Math.max(-1, dot / norm)),
  }
}
export function meanVector(vectors: number[][]): number[] {
  if (!vectors.length) throw new Error('Select at least one snapshot per group.')
  vectors.forEach(validateVector)
  return featureNames.map((_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length)
}
export function blendshapeGroup(name: string): string {
  for (const [prefix, group] of [
    ['brow', 'Eyebrows'],
    ['eye', 'Eyes'],
    ['mouth', 'Mouth'],
    ['jaw', 'Jaw'],
    ['cheek', 'Cheeks'],
    ['nose', 'Nose'],
  ])
    if (name.startsWith(prefix)) return group
  return 'Other'
}
export const blendshapeGroups = ['Eyebrows', 'Eyes', 'Mouth', 'Jaw', 'Cheeks', 'Nose', 'Other']
