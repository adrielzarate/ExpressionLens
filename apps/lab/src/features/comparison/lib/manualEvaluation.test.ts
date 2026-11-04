import { defaultThresholds, evaluateExpression } from '../../../lib/expressionRules'
import { expect, it } from 'vitest'
import { captureEvaluation, exportManualEvaluation, manualAccuracy } from './manualEvaluation'
import { pair } from '../test/fixtures'

it('captures only paired numerical predictions, without photos, feature vectors or training writes', () => {
  const row = captureEvaluation('smile', pair(1000), 1100)
  expect(row).toMatchObject({
    targetLabel: 'smile',
    rulePrediction: 'smile',
    neuralPrediction: 'smile',
    frameTimestampMs: 1000,
    inferenceMs: 1.2,
  })
  expect(row.neuralProbabilities).toHaveLength(4)
  expect('features' in row || 'image' in row || 'video' in row).toBe(false)
  expect(() => captureEvaluation('smile', pair(1000), 1600)).toThrow('not fresh')
  expect(() =>
    captureEvaluation(
      'smile',
      { ...pair(1000), frame: { ...pair(1000).frame, faceCount: 2 } },
      1100,
    ),
  ).toThrow('not fresh')
})
it('reports separate agreement accuracies and exports intended-label limitations plus raw/smoothed distributions', () => {
  const row = captureEvaluation('smile', pair(1000), 1100)
  const wrong = {
    ...row,
    id: 'another',
    targetLabel: 'angry' as const,
    neuralPrediction: 'angry' as const,
  }
  expect(manualAccuracy([row, wrong])).toEqual({ count: 2, ruleAccuracy: 0.5, neuralAccuracy: 1 })
  expect(manualAccuracy([])).toEqual({ count: 0, ruleAccuracy: null, neuralAccuracy: null })
  const exported = JSON.parse(exportManualEvaluation([row, wrong]))
  expect(exported.targetMeaning).toContain('not objective ground truth')
  expect(exported.samples[0].rawNeuralProbabilities).toHaveLength(4)
  expect(exported.perModel[0].count).toBe(2)
})

it('exports angry rules and a detached snapshot of the tunable heuristic settings', () => {
  const prediction = pair(1000)
  const values: Record<string, number> = {
    browDownLeft: 0.8,
    browDownRight: 0.8,
    mouthPressLeft: 0.7,
    mouthPressRight: 0.7,
  }
  prediction.frame.blendshapes = prediction.frame.blendshapes.map((row) => ({
    ...row,
    score: values[row.name] ?? 0,
  }))
  const analysis = evaluateExpression(prediction.frame.blendshapes)!
  prediction.rule = analysis.expression
  prediction.heuristic = {
    thresholds: { ...defaultThresholds },
    scores: analysis.scores,
    ambiguous: analysis.ambiguous,
  }
  const row = captureEvaluation('angry', prediction, 1100)
  prediction.heuristic.thresholds.angryBrowMin = 0.9
  expect(row.rulePrediction).toBe('angry')
  expect(row.heuristic?.thresholds.angryBrowMin).toBe(0.3)
  expect(
    JSON.parse(exportManualEvaluation([row])).samples[0].heuristic.scores.Angry,
  ).toBeGreaterThan(0.5)
})

it('scores the original four-class argmax even when the interpretation abstains', async () => {
  const { mapProbabilities } = await import('./probabilities')
  const prediction = pair(1000)
  prediction.primary = prediction.raw = mapProbabilities(
    [0.55, 0.008, 0.002, 0.44],
    ['neutral', 'smile', 'surprise', 'angry'],
  )
  const row = captureEvaluation('neutral', prediction, 1100)
  expect(row.neuralInterpretedLabel).toBe('uncertain')
  expect(row.neuralPrediction).toBe('neutral')
  expect(row.rawNeuralPrediction).toBe('neutral')
  expect(manualAccuracy([row]).neuralAccuracy).toBe(1)
})
