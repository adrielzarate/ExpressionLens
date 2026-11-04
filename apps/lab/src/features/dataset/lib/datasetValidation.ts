import { datasetMetadata } from './featureSchema'
import { validateMetadata } from '@expressionlens/classifier'
export { validateMetadata } from '@expressionlens/classifier'
import { expressionLabels } from '../types/dataset'
import type { FacialExpressionDataset, FacialExpressionSample } from '../types/dataset'

function record(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${context} must be an object.`)
  return value as Record<string, unknown>
}
function text(value: unknown, field: string, max = 200): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > max ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error(`${field} must be a non-empty, trimmed identifier (maximum ${max} characters).`)
  }
  return value
}
function date(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${field} must be an ISO-8601 timestamp.`)
  }
  return value
}
export function validateParticipantId(value: unknown): string {
  return text(value, 'Participant ID')
}

export function validateSample(value: unknown): FacialExpressionSample {
  const sample = record(value, 'Sample')
  // Legacy schema-v1 exports and stored records used frown for this category.
  const label = sample.label === 'frown' ? 'angry' : sample.label
  if (!expressionLabels.some((value) => label === value))
    throw new Error('Unknown expression label.')
  if (sample.source !== 'synthetic' && sample.source !== 'real')
    throw new Error('Source must be synthetic or real.')
  if (
    !Array.isArray(sample.features) ||
    sample.features.length !== 52 ||
    Array.from(sample.features).some(
      (n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1,
    )
  ) {
    throw new Error('Features must contain exactly 52 finite numbers between 0 and 1.')
  }
  // Construct a clean sample: never persist extra imported fields such as images.
  return {
    id: text(sample.id, 'Sample ID'),
    participantId: validateParticipantId(sample.participantId),
    sessionId: text(sample.sessionId, 'Session ID'),
    label: label as FacialExpressionSample['label'],
    source: sample.source,
    features: [...sample.features] as number[],
    createdAt: date(sample.createdAt, 'createdAt'),
    ...(sample.sourceFileName !== undefined
      ? { sourceFileName: text(sample.sourceFileName, 'Source filename', 512) }
      : {}),
  }
}

export function validateDataset(value: unknown): FacialExpressionDataset {
  const data = record(value, 'Dataset')
  validateMetadata(data)
  if (!Array.isArray(data.samples)) throw new Error('Dataset samples must be an array.')
  const seen = new Set<string>()
  const samples = Array.from(data.samples, (sample: unknown, index: number) => {
    try {
      const valid = validateSample(sample)
      if (seen.has(valid.id)) throw new Error(`Duplicate sample ID: ${valid.id}`)
      seen.add(valid.id)
      return valid
    } catch (error) {
      throw new Error(
        `Sample ${index + 1}: ${error instanceof Error ? error.message : 'Invalid sample.'}`,
      )
    }
  })
  return { ...datasetMetadata(), exportedAt: date(data.exportedAt, 'exportedAt'), samples }
}

export function parseDatasetJson(json: string): FacialExpressionDataset {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  return validateDataset(value)
}

export function planDatasetImport(dataset: FacialExpressionDataset, existingIds: Iterable<string>) {
  const known = new Set(existingIds)
  const additions = dataset.samples.filter((sample) => !known.has(sample.id))
  const duplicateCount = dataset.samples.length - additions.length
  return { additions, duplicateCount, total: dataset.samples.length }
}
