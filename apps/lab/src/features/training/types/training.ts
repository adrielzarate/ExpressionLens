import type { FacialExpressionSample } from '../../dataset/types/dataset'

import { expressionLabels as trainingLabels } from '@expressionlens/classifier'
export { trainingLabels }
export type SplitName = 'train' | 'validation' | 'test'
export const splitNames: SplitName[] = ['train', 'validation', 'test']
export const splitRatios = [0.7, 0.15, 0.15] as const

export interface PreparationReport {
  originalSamples: number
  usableSamples: number
  duplicatesExcluded: number
  duplicateGroups: number
  conflictingGroups: number
  conflictingSamplesExcluded: number
}
export interface SplitSummary {
  samples: number
  participants: number
  perClass: number[]
  synthetic: number
  real: number
}
export interface PreparedDataset {
  splits: Record<SplitName, FacialExpressionSample[]>
  summary: Record<SplitName, SplitSummary>
  report: PreparationReport
  warnings: string[]
  seed: number
}
export interface TrainingConfig {
  seed: number
  learningRate: number
  batchSize: number
  maxEpochs: number
  patience: number
}
export const defaultTrainingConfig: TrainingConfig = {
  seed: 42,
  learningRate: 0.001,
  batchSize: 16,
  maxEpochs: 100,
  patience: 10,
}
export const architecture = {
  type: 'sequential-mlp',
  inputShape: [52],
  layers: [
    { units: 32, activation: 'relu' },
    { units: 16, activation: 'relu' },
    { units: 4, activation: 'softmax' },
  ],
} as const
export interface EpochMetrics {
  epoch: number
  loss: number
  accuracy: number
  validationLoss: number
  validationAccuracy: number
}
export interface ClassificationMetrics {
  sampleCount: number
  accuracy: number
  macroF1: number
  confusionMatrix: number[][]
  perClass: {
    label: (typeof trainingLabels)[number]
    precision: number
    recall: number
    f1: number
    support: number
  }[]
}
export interface ExportArtifacts {
  modelJson: string
  weights: ArrayBuffer
}
export interface TrainingResult {
  artifacts: ExportArtifacts
  metadataJson: string
  metrics: ClassificationMetrics
  history: EpochMetrics[]
  bestEpoch: number
  stopReason: 'early-stopping' | 'max-epochs'
  trainedAt: string
  evaluationDomain: 'synthetic' | 'real' | 'mixed'
}
export type TrainingRequest = { type: 'train'; data: PreparedDataset; config: TrainingConfig }
export type TrainingResponse =
  | { type: 'epoch'; metrics: EpochMetrics }
  | { type: 'evaluating' }
  | { type: 'complete'; result: TrainingResult }
  | { type: 'error'; message: string }
