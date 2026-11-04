import { datasetMetadata, featureNames } from '../../dataset/lib/featureSchema'
import { expressionLabels } from '../../dataset/types/dataset'
import type { DatasetMetadata, ExpressionLabel } from '../../dataset/types/dataset'
import { defaultThresholds, expressionCategories } from '../../../lib/expressionRules'
import type {
  Expression,
  ExpressionThresholds,
  HeuristicScores,
} from '../../../lib/expressionRules'
import { mapProbabilities } from '../../comparison/lib/probabilities'
import { validateVector } from './comparison'
import type { InspectorExport, InspectorSnapshot } from '../types'

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object.')
  return value as Record<string, unknown>
}
const text = (value: unknown, max = 200): string => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max)
    throw new Error('Invalid text or identifier.')
  return value
}
const number = (value: unknown, max = 1): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)
    throw new Error('Invalid numerical value.')
  return value
}
const timestamp = (value: unknown): string => {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result)))
    throw new Error('Invalid timestamp.')
  return result
}
function modelInfo(value: unknown): DatasetMetadata['modelInfo'] {
  const item = object(value)
  const sha256 = text(item.sha256)
  if (!/^[a-f\d]{64}$/i.test(sha256)) throw new Error('Invalid MediaPipe SHA-256.')
  return { name: text(item.name), version: text(item.version), sha256 }
}
function label(value: unknown): ExpressionLabel {
  if (!expressionLabels.includes(value as ExpressionLabel))
    throw new Error('Invalid intended expression label.')
  return value as ExpressionLabel
}
function parseSnapshot(value: unknown): InspectorSnapshot {
  const row = object(value)
  validateVector(row.features)
  const rule = object(row.rule),
    expression = object(rule.expression),
    thresholds = object(rule.thresholds),
    scores = object(rule.scores)
  if (!expressionCategories.includes(expression.label as Expression['label']))
    throw new Error('Invalid rule prediction.')
  const ruleLabel = expression.label as Expression['label']
  if (
    typeof rule.ambiguous !== 'boolean' ||
    (rule.angryPattern !== null &&
      rule.angryPattern !== 'closed lips' &&
      rule.angryPattern !== 'clenched mouth')
  )
    throw new Error('Invalid heuristic diagnostics.')
  const parsedThresholds = Object.fromEntries(
    Object.keys(defaultThresholds).map((key) => [key, number(thresholds[key])]),
  ) as ExpressionThresholds
  const parsedScores = Object.fromEntries(
    expressionCategories.map((key) => [key, number(scores[key])]),
  ) as HeuristicScores
  const nn = object(row.neural)
  let neural: InspectorSnapshot['neural']
  if (nn.status === 'unavailable') neural = { status: 'unavailable', reason: text(nn.reason, 2000) }
  else if (nn.status === 'available') {
    const prediction = object(nn.prediction)
    if (!Array.isArray(prediction.distribution) || prediction.distribution.length !== 4)
      throw new Error('Expected four neural probabilities.')
    const distribution = prediction.distribution.map(object)
    if (distribution.some((entry, i) => entry.label !== expressionLabels[i]))
      throw new Error('Invalid neural label order.')
    const normalized = mapProbabilities(
      distribution.map((entry) => number(entry.probability)),
      [...expressionLabels],
    )
    const hasInterpretation = ['rawLabel', 'margin', 'isUncertain'].some((key) => key in prediction)
    // Version-1 exports originally stored only the four-class argmax. Upgrade
    // their interpretation from the preserved distribution without losing it.
    if (
      prediction.label !== (hasInterpretation ? normalized.label : normalized.rawLabel) ||
      typeof prediction.confidence !== 'number' ||
      !Number.isFinite(prediction.confidence) ||
      Math.abs(prediction.confidence - normalized.confidence) > 1e-6 ||
      (hasInterpretation &&
        (prediction.rawLabel !== normalized.rawLabel ||
          prediction.isUncertain !== normalized.isUncertain ||
          typeof prediction.margin !== 'number' ||
          !Number.isFinite(prediction.margin) ||
          Math.abs(prediction.margin - normalized.margin) > 1e-12))
    )
      throw new Error('Inconsistent neural prediction.')
    neural = {
      status: 'available',
      prediction: normalized,
      modelId: text(nn.modelId),
      modelName: text(nn.modelName, 1000),
      trainedAt: nn.trainedAt === null ? null : timestamp(nn.trainedAt),
    }
  } else throw new Error('Invalid neural availability status.')
  return {
    id: text(row.id),
    timestamp: timestamp(row.timestamp),
    frameTimestampMs: number(row.frameTimestampMs, Number.MAX_VALUE),
    label: label(row.label),
    ...(row.description === undefined ? {} : { description: text(row.description, 2000) }),
    features: [...row.features],
    modelInfo: modelInfo(row.modelInfo),
    rule: {
      expression: {
        label: ruleLabel,
        emoji: { Neutral: '😐', Smile: '🙂', Surprise: '😮', Angry: '😠' }[ruleLabel],
      },
      thresholds: parsedThresholds,
      scores: parsedScores,
      ambiguous: rule.ambiguous,
      angryPattern: rule.angryPattern as InspectorSnapshot['rule']['angryPattern'],
    },
    neural,
  }
}
export function parseInspectorJSON(json: string): InspectorSnapshot[] {
  if (json.length > 50_000_000) throw new Error('Inspector JSON exceeds 50 MB.')
  const data = object(JSON.parse(json))
  if (data.type !== 'interview-mirror-blendshape-inspector' || data.schemaVersion !== 1)
    throw new Error('Unsupported inspector export schema.')
  const schema = object(data.featureSchema)
  if (
    schema.version !== 1 ||
    schema.type !== 'mediapipe-face-blendshapes' ||
    !Array.isArray(schema.featureNames) ||
    schema.featureNames.length !== 52 ||
    schema.featureNames.some((name, i) => name !== featureNames[i])
  )
    throw new Error('Incompatible feature schema or ordering.')
  timestamp(data.exportedAt)
  modelInfo(data.modelInfo)
  if (!Array.isArray(data.snapshots) || data.snapshots.length > 10_000)
    throw new Error('Expected at most 10000 inspector snapshots.')
  const snapshots = data.snapshots.map(parseSnapshot)
  if (new Set(snapshots.map((row) => row.id)).size !== snapshots.length)
    throw new Error('Duplicate snapshot IDs.')
  return snapshots
}
export function mergeSnapshots(
  existing: InspectorSnapshot[],
  imported: InspectorSnapshot[],
): InspectorSnapshot[] {
  const ids = new Set(existing.map((row) => row.id))
  if (imported.some((row) => ids.has(row.id)))
    throw new Error(
      'Snapshot IDs already exist. Clear snapshots before re-importing the same export.',
    )
  if (existing.length + imported.length > 10_000)
    throw new Error('Snapshot limit reached (10000). Export and clear before continuing.')
  return [...existing, ...imported]
}
export function serializeSnapshots(snapshots: InspectorSnapshot[]): string {
  const { featureSchema, modelInfo } = datasetMetadata()
  const data: InspectorExport = {
    type: 'interview-mirror-blendshape-inspector',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    featureSchema,
    modelInfo,
    snapshots,
  }
  return JSON.stringify(data, null, 2)
}
export function downloadSnapshots(snapshots: InspectorSnapshot[]) {
  const url = URL.createObjectURL(
    new Blob([serializeSnapshots(snapshots)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'interview-mirror-inspector.json'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
