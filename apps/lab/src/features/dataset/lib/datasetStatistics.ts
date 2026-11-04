import { expressionLabels } from '../types/dataset'
import type { FacialExpressionSample } from '../types/dataset'

export const smallClassThreshold = 20
export function datasetStatistics(samples: readonly FacialExpressionSample[]) {
  const classes = expressionLabels.map((label) => {
    const rows = samples.filter((sample) => sample.label === label)
    return {
      label,
      samples: rows.length,
      participants: new Set(rows.map((sample) => sample.participantId)).size,
    }
  })
  const participants = new Set(samples.map((sample) => sample.participantId)).size
  return {
    total: samples.length,
    participants,
    sessions: new Set(samples.map((sample) => sample.sessionId)).size,
    synthetic: samples.filter((sample) => sample.source === 'synthetic').length,
    real: samples.filter((sample) => sample.source === 'real').length,
    classes,
    warnings: [
      ...(samples.length && participants === 1
        ? ['Only one participant: collect other people before evaluating generalization.']
        : []),
      ...classes
        .filter((row) => row.samples < smallClassThreshold)
        .map((row) => `${row.label}: fewer than ${smallClassThreshold} samples (${row.samples}).`),
    ],
  }
}
