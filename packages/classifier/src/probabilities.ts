import type { Blendshape } from './types'
import type { ExpressionLabel } from './types'
import type { ProbabilityPrediction } from './types'

// Interpretation only: never a fifth model output or a training/evaluation class.
export const UNCERTAINTY_MARGIN_THRESHOLD = 0.15

export function orderedFeatures(shapes: readonly Blendshape[], names: readonly string[]): number[] {
  if (shapes.length !== 52 || names.length !== 52 || new Set(names).size !== 52)
    throw new Error('Exactly 52 named coefficients are required.')
  const values = new Map<string, number>()
  for (const shape of shapes) {
    if (
      values.has(shape.name) ||
      !Number.isFinite(shape.score) ||
      shape.score < 0 ||
      shape.score > 1
    )
      throw new Error(`Invalid or duplicate blendshape: ${shape.name}`)
    values.set(shape.name, shape.score)
  }
  return names.map((name) => {
    const value = values.get(name)
    if (value === undefined) throw new Error(`Missing blendshape: ${name}`)
    return value
  })
}
export function mapProbabilities(
  values: readonly number[],
  labels: readonly ExpressionLabel[],
): ProbabilityPrediction {
  if (
    values.length !== 4 ||
    labels.length !== 4 ||
    new Set(labels).size !== 4 ||
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.001
  )
    throw new Error('The classifier did not return four finite softmax probabilities.')
  const ranked = values
    .map((probability, index) => ({ probability, index }))
    .sort((a, b) => b.probability - a.probability)
  const best = ranked[0].index
  const margin = ranked[0].probability - ranked[1].probability
  // Treat representational roundoff at the inclusive boundary as equality.
  const isUncertain = margin < UNCERTAINTY_MARGIN_THRESHOLD - Number.EPSILON * 4
  return {
    rawLabel: labels[best],
    label: isUncertain ? 'uncertain' : labels[best],
    margin,
    isUncertain,
    confidence: values[best],
    distribution: labels.map((label, index) => ({ label, probability: values[index] })),
  }
}
