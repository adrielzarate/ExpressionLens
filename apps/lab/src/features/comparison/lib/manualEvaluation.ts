import type { ExpressionLabel } from '../../dataset/types/dataset'
import type { ManualEvaluationSample, PairedPrediction } from '../types/comparison'
import type { Expression } from '../../../lib/expressionRules'

export const manualFrameMaxAgeMs = 500
export function ruleLabel(expression: Expression): ExpressionLabel {
  const labels: Record<Expression['label'], ExpressionLabel> = {
    Neutral: 'neutral',
    Smile: 'smile',
    Surprise: 'surprise',
    Angry: 'angry',
  }
  return labels[expression.label]
}
export function captureEvaluation(
  target: ExpressionLabel,
  pair: PairedPrediction,
  now = performance.now(),
): ManualEvaluationSample {
  if (!['neutral', 'smile', 'surprise', 'angry'].includes(target))
    throw new Error('Select an intended expression before capturing.')
  if (
    pair.frame.faceCount !== 1 ||
    pair.frame.timestampMs === null ||
    now - pair.frame.timestampMs > manualFrameMaxAgeMs
  )
    throw new Error(
      'The shared prediction is not fresh. Keep one face in view and wait for a new prediction.',
    )
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    frameTimestampMs: pair.frame.timestampMs,
    targetLabel: target,
    rulePrediction: ruleLabel(pair.rule),
    heuristic: pair.heuristic ? structuredClone(pair.heuristic) : undefined,
    // Agreement remains four-class argmax; abstentions are not scored as errors.
    neuralPrediction: pair.primary.rawLabel,
    neuralInterpretedLabel: pair.primary.label,
    neuralProbabilities: pair.primary.distribution.map((row) => ({ ...row })),
    rawNeuralPrediction: pair.raw.rawLabel,
    rawNeuralProbabilities: pair.raw.distribution.map((row) => ({ ...row })),
    inferenceMs: pair.inferenceMs,
    modelId: pair.modelId,
    modelName: pair.modelName,
    modelTrainedAt: pair.modelTrainedAt,
    smoothing: pair.smoothing,
  }
}
export function manualAccuracy(rows: readonly ManualEvaluationSample[]) {
  const count = rows.length
  return {
    count,
    ruleAccuracy: count
      ? rows.filter((row) => row.rulePrediction === row.targetLabel).length / count
      : null,
    neuralAccuracy: count
      ? rows.filter((row) => row.neuralPrediction === row.targetLabel).length / count
      : null,
  }
}
export function exportManualEvaluation(rows: readonly ManualEvaluationSample[]): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      type: 'interview-mirror-manual-expression-evaluation',
      exportedAt: new Date().toISOString(),
      targetMeaning:
        'User-selected intended expression; not objective ground truth or emotional state.',
      disclaimer:
        'Visible expressions only. Not emotions, honesty, personality, or interview suitability. Synthetic training metrics do not establish real-world performance.',
      metrics: manualAccuracy(rows),
      perModel: [...new Set(rows.map((row) => row.modelId))].map((modelId) => ({
        modelId,
        ...manualAccuracy(rows.filter((row) => row.modelId === modelId)),
      })),
      samples: rows,
    },
    null,
    2,
  )
}
export function downloadManualEvaluation(rows: readonly ManualEvaluationSample[]) {
  const url = URL.createObjectURL(
    new Blob([exportManualEvaluation(rows)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `interview-mirror-manual-evaluation-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
