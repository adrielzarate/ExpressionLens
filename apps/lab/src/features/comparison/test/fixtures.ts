import { datasetMetadata } from '../../dataset/lib/featureSchema'
import { architecture, trainingLabels } from '../../training/types/training'
import { validateClassifierMetadata } from '../lib/compatibility'
import type { LoadedClassifier, PairedPrediction } from '../types/comparison'
import { emptySnapshot } from '../../../types/face'
import { featureNames } from '../../dataset/lib/featureSchema'
import { mapProbabilities } from '../lib/probabilities'

export function metadataValue() {
  return {
    ...datasetMetadata(),
    metadataVersion: 1,
    type: 'interview-mirror-facial-expression-classifier',
    labelOrder: [...trainingLabels],
    architecture: structuredClone(architecture),
    preprocessing: { type: 'none', featureRange: [0, 1], featureCount: 52 },
    trainedAt: '2026-11-01T10:00:00.000Z',
    evaluationDomain: 'synthetic',
  }
}
export function frame(timestampMs = performance.now()) {
  return {
    ...emptySnapshot(),
    timestampMs,
    faceCount: 1,
    faceDetected: true,
    blendshapes: featureNames.map((name) => ({
      name,
      score: name.startsWith('mouthSmile') ? 0.8 : 0,
    })),
  }
}
export function classifier(
  predict: LoadedClassifier['predict'] = async () => [0.1, 0.7, 0.1, 0.1],
  dispose = () => {},
): LoadedClassifier {
  return {
    id: 'model-1',
    name: 'model.json',
    metadata: validateClassifierMetadata(metadataValue()),
    predict,
    dispose,
  }
}
export function pair(timestampMs = performance.now()): PairedPrediction {
  const prediction = mapProbabilities([0.1, 0.7, 0.1, 0.1], [...trainingLabels])
  return {
    frame: frame(timestampMs),
    rule: { label: 'Smile', emoji: '🙂' },
    raw: prediction,
    primary: prediction,
    inferenceMs: 1.2,
    modelId: 'model-1',
    modelName: 'model.json',
    modelTrainedAt: '2026-11-01T10:00:00.000Z',
    smoothing: 'disabled',
  }
}
