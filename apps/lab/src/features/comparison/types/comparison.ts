import type {
  ProbabilityPrediction,
  ClassProbability,
  NeuralPredictionLabel,
} from '@expressionlens/classifier'
export type {
  ClassProbability,
  NeuralPredictionLabel,
  ProbabilityPrediction,
  ClassifierMetadata,
  ClassifierFiles,
  LoadedClassifier,
} from '@expressionlens/classifier'
import type { FaceSnapshot } from '../../../types/face'
import type { ExpressionLabel } from '../../dataset/types/dataset'
import type {
  Expression,
  ExpressionThresholds,
  HeuristicScores,
} from '../../../lib/expressionRules'

export type SmoothingLevel = 'disabled' | 'low' | 'medium' | 'high'
export interface HeuristicSettingsSnapshot {
  thresholds: ExpressionThresholds
  scores: HeuristicScores
  ambiguous: boolean
}
export interface PairedPrediction {
  heuristic?: HeuristicSettingsSnapshot
  frame: FaceSnapshot
  rule: Expression
  raw: ProbabilityPrediction
  primary: ProbabilityPrediction
  inferenceMs: number
  modelId: string
  modelName: string
  modelTrainedAt: string | null
  smoothing: SmoothingLevel
}
export interface ManualEvaluationSample {
  heuristic?: HeuristicSettingsSnapshot
  id: string
  timestamp: string
  frameTimestampMs: number
  targetLabel: ExpressionLabel
  rulePrediction: ExpressionLabel
  neuralPrediction: ExpressionLabel
  neuralInterpretedLabel?: NeuralPredictionLabel
  neuralProbabilities: ClassProbability[]
  rawNeuralPrediction: ExpressionLabel
  rawNeuralProbabilities: ClassProbability[]
  inferenceMs: number
  modelId: string
  modelName: string
  modelTrainedAt: string | null
  smoothing: SmoothingLevel
}
