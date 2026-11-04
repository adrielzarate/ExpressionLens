import { trainingLabels } from '../types/training'
import type { ClassificationMetrics } from '../types/training'

export function classificationMetrics(
  actual: readonly number[],
  predicted: readonly number[],
): ClassificationMetrics {
  if (!actual.length || actual.length !== predicted.length)
    throw new Error('Evaluation requires equally sized, non-empty actual and predicted labels.')
  const confusionMatrix = Array.from({ length: 4 }, () => [0, 0, 0, 0])
  actual.forEach((label, index) => {
    const prediction = predicted[index]
    if (
      !Number.isInteger(label) ||
      label < 0 ||
      label > 3 ||
      !Number.isInteger(prediction) ||
      prediction < 0 ||
      prediction > 3
    )
      throw new Error('Evaluation labels must be integer class indices from 0 to 3.')
    confusionMatrix[label][prediction] += 1
  })
  const perClass = trainingLabels.map((label, index) => {
    const correct = confusionMatrix[index][index]
    const support = confusionMatrix[index].reduce((sum, count) => sum + count, 0)
    const predictedCount = confusionMatrix.reduce((sum, row) => sum + row[index], 0)
    const precision = predictedCount ? correct / predictedCount : 0
    const recall = support ? correct / support : 0
    return {
      label,
      precision,
      recall,
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
      support,
    }
  })
  return {
    sampleCount: actual.length,
    confusionMatrix,
    perClass,
    accuracy: confusionMatrix.reduce((sum, row, index) => sum + row[index], 0) / actual.length,
    macroF1: perClass.reduce((sum, row) => sum + row.f1, 0) / 4,
  }
}
