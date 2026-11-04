export interface Blendshape {
  name: string
  score: number
}
export const expressionLabels = ['neutral', 'smile', 'surprise', 'angry'] as const
export type ExpressionLabel = (typeof expressionLabels)[number]
export interface FeatureMetadata {
  schemaVersion: 1
  featureSchema: {
    version: 1
    type: 'mediapipe-face-blendshapes'
    featureNames: string[]
  }
  modelInfo: { name: string; version: string; sha256: string }
}
export interface ClassProbability {
  label: ExpressionLabel
  probability: number
}
export type NeuralPredictionLabel = ExpressionLabel | 'uncertain'
export interface ProbabilityPrediction {
  rawLabel: ExpressionLabel
  label: NeuralPredictionLabel
  margin: number
  isUncertain: boolean
  confidence: number
  distribution: ClassProbability[]
}
export interface ClassifierMetadata extends FeatureMetadata {
  metadataVersion: 1
  type: 'interview-mirror-facial-expression-classifier'
  labelOrder: ExpressionLabel[]
  architecture: {
    type: 'sequential-mlp'
    inputShape: number[]
    layers: { units: number; activation: string }[]
  }
  preprocessing: { type: 'none'; featureCount: 52; featureRange: number[] }
  trainedAt: string | null
  evaluationDomain: string | null
}
export interface ClassifierFiles {
  model: File
  weights: File[]
  metadata: File
}
export interface LoadedClassifier {
  id: string
  name: string
  metadata: ClassifierMetadata
  predict: (features: number[]) => Promise<number[]>
  dispose: () => void
}
