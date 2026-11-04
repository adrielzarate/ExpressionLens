import type {
  ExpressionLabel,
  FeatureMetadata as DatasetMetadata,
} from '@expressionlens/classifier'
export { expressionLabels } from '@expressionlens/classifier'
export type {
  ExpressionLabel,
  FeatureMetadata as DatasetMetadata,
} from '@expressionlens/classifier'
export type ImageImportMode = 'different-identities' | 'same-identity'
export type SampleSource = 'synthetic' | 'real'

export interface FacialExpressionSample {
  id: string
  participantId: string
  sessionId: string
  label: ExpressionLabel
  features: number[]
  source: SampleSource
  createdAt: string
  sourceFileName?: string
}

export interface FacialExpressionDataset extends DatasetMetadata {
  exportedAt: string
  samples: FacialExpressionSample[]
}
export interface SampleIdentity {
  participantId: string
  label: ExpressionLabel
  source: SampleSource
}
