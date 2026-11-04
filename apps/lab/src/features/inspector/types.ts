import type { DatasetMetadata, ExpressionLabel } from '../dataset/types/dataset'
import type { HeuristicAnalysis, ExpressionThresholds } from '../../lib/expressionRules'
import type { ProbabilityPrediction } from '../comparison/types/comparison'

export interface InspectorSnapshot {
  id: string
  timestamp: string
  frameTimestampMs: number
  label: ExpressionLabel
  description?: string
  features: number[]
  modelInfo: DatasetMetadata['modelInfo']
  rule: HeuristicAnalysis & { thresholds: ExpressionThresholds }
  neural:
    | { status: 'unavailable'; reason: string }
    | {
        status: 'available'
        prediction: ProbabilityPrediction
        modelId: string
        modelName: string
        trainedAt: string | null
      }
}
export interface InspectorExport {
  type: 'interview-mirror-blendshape-inspector'
  schemaVersion: 1
  exportedAt: string
  featureSchema: DatasetMetadata['featureSchema']
  modelInfo: DatasetMetadata['modelInfo']
  snapshots: InspectorSnapshot[]
}
