import { object, keys, text, numeric } from './validation'
import { vocalRecord, analysisSelection } from './vocalSerialization'
import type { ExpressionLabel, NeuralPredictionLabel } from '@expressionlens/classifier'
import type { AnalysisSession, ExpressionSample, SessionVideoMetadata } from '../../analysis/types'

import { emptyTranscription } from '../../speech/types'
import type { SessionTranscription } from '../../speech/types'

export const SESSION_SCHEMA_VERSION = 3
export const MAX_SESSION_BYTES = 50 * 1024 * 1024
export const MAX_SESSION_SAMPLES = 50_000
export interface ExportedSession {
  schemaVersion: 3
  exportedAt: string
  session: AnalysisSession & { video: SessionVideoMetadata }
}
const labels: readonly ExpressionLabel[] = ['neutral', 'smile', 'surprise', 'angry']
const interpreted: readonly NeuralPredictionLabel[] = [...labels, 'uncertain']
function date(value: unknown, field: string): string {
  const result = text(value, field)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new Error(`${field} must be an ISO-8601 timestamp.`)
  return result
}
function videoMetadata(value: unknown, strict: boolean): SessionVideoMetadata {
  const video = object(value, 'Video metadata')
  keys(
    video,
    ['filename', 'sizeBytes', 'durationMs', 'width', 'height', 'mimeType'],
    'Video metadata',
    strict,
  )
  const filename = text(video.filename, 'Video filename', 512, false)
  if (/^(blob:|data:)/i.test(filename))
    throw new Error('Video filename must not contain an object URL or embedded content.')
  return {
    filename,
    sizeBytes: numeric(video.sizeBytes, 'Video size', 1, Number.MAX_SAFE_INTEGER, true),
    durationMs: numeric(video.durationMs, 'Video duration', Number.MIN_VALUE, 86_400_000),
    width: numeric(video.width, 'Video width', 1, 32768, true),
    height: numeric(video.height, 'Video height', 1, 32768, true),
    ...(video.mimeType === undefined
      ? {}
      : { mimeType: text(video.mimeType, 'Video MIME type', 200) }),
  }
}
function sampleRecord(value: unknown, durationMs: number, strict: boolean): ExpressionSample {
  const row = object(value, 'Sample')
  const timestampMs = numeric(row.timestampMs, 'Sample timestamp', 0, durationMs)
  if (timestampMs >= durationMs) throw new Error('Sample timestamp must be before video end.')
  if (row.status === 'no-face' || row.status === 'multiple-faces') {
    keys(row, ['status', 'timestampMs'], 'Skipped sample', strict)
    return { status: row.status, timestampMs }
  }
  if (row.status !== 'detected') throw new Error('Unknown sample detection status.')
  keys(
    row,
    [
      'status',
      'timestampMs',
      'label',
      'rawLabel',
      'confidence',
      'margin',
      'distribution',
      'isUncertain',
    ],
    'Detected sample',
    strict,
  )
  if (
    !interpreted.includes(row.label as NeuralPredictionLabel) ||
    !labels.includes(row.rawLabel as ExpressionLabel)
  )
    throw new Error('Unknown expression label.')
  if (
    typeof row.isUncertain !== 'boolean' ||
    row.isUncertain !== (row.label === 'uncertain') ||
    (!row.isUncertain && row.label !== row.rawLabel)
  )
    throw new Error('Inconsistent interpreted expression.')
  if (!Array.isArray(row.distribution) || row.distribution.length !== 4)
    throw new Error('Expected all four class probabilities.')
  const distribution = row.distribution.map((value, index) => {
    const entry = object(value, 'Probability')
    keys(entry, ['label', 'probability'], 'Probability', strict)
    if (entry.label !== labels[index])
      throw new Error('Probability labels must be ordered neutral, smile, surprise, angry.')
    return { label: labels[index], probability: numeric(entry.probability, 'Probability', 0, 1) }
  })
  if (Math.abs(distribution.reduce((sum, entry) => sum + entry.probability, 0) - 1) > 0.001)
    throw new Error('Class probabilities must sum to 1.')
  const ranked = [...distribution].sort((a, b) => b.probability - a.probability)
  const confidence = numeric(row.confidence, 'Confidence', 0, 1),
    margin = numeric(row.margin, 'Top-two margin', 0, 1)
  if (
    row.rawLabel !== ranked[0].label ||
    Math.abs(confidence - ranked[0].probability) > 1e-6 ||
    Math.abs(margin - (ranked[0].probability - ranked[1].probability)) > 1e-6
  )
    throw new Error('Raw prediction, confidence or margin does not match the stored probabilities.')
  // Preserve historical interpretation; do not initialize or re-run a classifier,
  // recompute uncertainty, normalize probabilities, or change model thresholds.
  return {
    status: 'detected',
    timestampMs,
    label: row.label as NeuralPredictionLabel,
    rawLabel: row.rawLabel as ExpressionLabel,
    isUncertain: row.isUncertain,
    confidence,
    margin,
    distribution,
  }
}
function transcriptString(value: unknown, field: string, max = 1_000_000): string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error(`${field} must be text up to ${max} characters.`)
  return value
}
function transcriptionRecord(
  value: unknown,
  durationMs: number,
  strict: boolean,
): SessionTranscription {
  const row = object(value, 'Transcription')
  keys(
    row,
    [
      'status',
      'selectedLanguage',
      'detectedLanguage',
      'text',
      'segments',
      'timestampWarning',
      'error',
      'metadata',
    ],
    'Transcription',
    strict,
  )
  if (!['not-requested', 'completed', 'error', 'cancelled'].includes(String(row.status)))
    throw new Error('Invalid transcription status.')
  if (!['auto', 'english', 'spanish'].includes(String(row.selectedLanguage)))
    throw new Error('Invalid selected transcription language.')
  if (
    row.detectedLanguage !== null &&
    (typeof row.detectedLanguage !== 'string' || !/^[a-zA-Z-]{2,40}$/.test(row.detectedLanguage))
  )
    throw new Error('Invalid detected language.')
  const fullText = transcriptString(row.text, 'Transcript')
  if (!Array.isArray(row.segments) || row.segments.length > 50_000)
    throw new Error('Invalid transcript segment count.')
  let previousEnd = 0
  const segments = row.segments.map((value: unknown, index: number) => {
    const segment = object(value, `Transcript segment ${index + 1}`)
    keys(segment, ['startMs', 'endMs', 'text'], 'Transcript segment', strict)
    const startMs = numeric(segment.startMs, 'Segment start', 0, durationMs)
    const endMs = numeric(segment.endMs, 'Segment end', 0, durationMs)
    if (endMs <= startMs || startMs < previousEnd)
      throw new Error(
        'Transcript segments must have positive duration and chronological, non-overlapping boundaries.',
      )
    previousEnd = endMs
    const content = transcriptString(segment.text, 'Segment text', 100_000)
    if (!content.trim()) throw new Error('Transcript segment text must be nonempty.')
    return { startMs, endMs, text: content }
  })
  if (row.status !== 'completed' && (fullText || segments.length))
    throw new Error('Only completed transcription can contain transcript content.')
  let metadata: SessionTranscription['metadata']
  if (row.metadata !== undefined) {
    const data = object(row.metadata, 'STT metadata')
    keys(
      data,
      ['modelId', 'backend', 'inferenceMs', 'loadMs', 'audioDurationMs'],
      'STT metadata',
      strict,
    )
    if (data.backend !== 'wasm' && data.backend !== 'webgpu')
      throw new Error('Unknown STT backend.')
    metadata = {
      modelId: text(data.modelId, 'STT model ID'),
      backend: data.backend,
      inferenceMs: numeric(data.inferenceMs, 'Inference time', 0, Number.MAX_SAFE_INTEGER),
      loadMs: numeric(data.loadMs, 'STT loading time', 0, Number.MAX_SAFE_INTEGER),
      audioDurationMs: numeric(
        data.audioDurationMs,
        'Audio duration',
        Number.MIN_VALUE,
        86_400_000,
      ),
    }
  }
  return {
    status: row.status as SessionTranscription['status'],
    selectedLanguage: row.selectedLanguage as SessionTranscription['selectedLanguage'],
    detectedLanguage: row.detectedLanguage as string | null,
    text: fullText,
    segments,
    ...(row.timestampWarning === undefined
      ? {}
      : { timestampWarning: text(row.timestampWarning, 'Timestamp warning', 2000) }),
    ...(row.error === undefined ? {} : { error: transcriptString(row.error, 'STT error', 4000) }),
    ...(metadata ? { metadata } : {}),
  }
}
function normalizeSession(
  value: unknown,
  strict: boolean,
  version: 1 | 2 | 3 = 3,
): AnalysisSession & { video: SessionVideoMetadata } {
  const session = object(value, 'Session')
  keys(
    session,
    [
      'id',
      'source',
      'createdAt',
      'durationMs',
      'modelVersion',
      'samplingFps',
      'video',
      'samples',
      ...(version >= 2 ? ['facialStatus', 'facialError', 'transcription'] : []),
      ...(version === 3 ? ['vocal', 'selectedAnalyses'] : []),
    ],
    'Session',
    strict,
  )
  if (session.source !== 'upload' && session.source !== 'live')
    throw new Error('Unknown session source.')
  const durationMs = numeric(session.durationMs, 'Session duration', Number.MIN_VALUE, 86_400_000)
  const samplingFps = numeric(session.samplingFps, 'Sampling FPS', Number.MIN_VALUE, 60)
  if (!Number.isFinite(1000 / samplingFps)) throw new Error('Invalid sampling rate.')
  const video = videoMetadata(session.video, strict)
  if (Math.abs(video.durationMs - durationMs) > 1)
    throw new Error('Video and session durations are inconsistent.')
  const facialStatus =
    version === 1 || (!strict && session.facialStatus === undefined)
      ? 'completed'
      : session.facialStatus
  if (!['not-requested', 'completed', 'error', 'cancelled'].includes(String(facialStatus)))
    throw new Error('Invalid facial analysis status.')
  if (
    !Array.isArray(session.samples) ||
    (facialStatus === 'completed' && !session.samples.length) ||
    session.samples.length > MAX_SESSION_SAMPLES
  )
    throw new Error(`Expected 1–${MAX_SESSION_SAMPLES} samples.`)
  if (facialStatus !== 'completed' && session.samples.length)
    throw new Error('Facial samples require completed facial analysis status.')
  let previous = -1
  const samples = session.samples.map((row: unknown, index: number) => {
    try {
      const sample = sampleRecord(row, durationMs, strict)
      if (sample.timestampMs <= previous)
        throw new Error('Sample timestamps must be strictly increasing.')
      previous = sample.timestampMs
      return sample
    } catch (error) {
      throw new Error(
        `Sample ${index + 1}: ${error instanceof Error ? error.message : 'Invalid sample.'}`,
      )
    }
  })
  return {
    ...(version === 3 && session.vocal !== undefined
      ? { vocal: vocalRecord(session.vocal, durationMs, strict) }
      : {}),
    ...(version === 3 && session.selectedAnalyses !== undefined
      ? { selectedAnalyses: analysisSelection(session.selectedAnalyses, strict) }
      : {}),
    id: text(session.id, 'Session ID'),
    source: session.source,
    createdAt: date(session.createdAt, 'Session creation time'),
    durationMs,
    modelVersion: text(session.modelVersion, 'Model version', 100),
    samplingFps,
    video,
    samples,
    facialStatus: facialStatus as AnalysisSession['facialStatus'],
    ...(session.facialError === undefined
      ? {}
      : { facialError: transcriptString(session.facialError, 'Facial error', 4000) }),
    transcription:
      version === 1
        ? emptyTranscription()
        : transcriptionRecord(
            session.transcription ?? (!strict ? emptyTranscription() : undefined),
            durationMs,
            strict,
          ),
  }
}
// Explicit v1 migration: validate the old whitelist and preserve every facial sample;
// absence of STT is recorded as not-requested, with no inferred text/language.
export function migrateVersion1Session(value: unknown) {
  return normalizeSession(value, true, 1)
}
export function parseSessionJSON(json: string): AnalysisSession & { video: SessionVideoMetadata } {
  if (json.length > MAX_SESSION_BYTES || new Blob([json]).size > MAX_SESSION_BYTES)
    throw new Error('Session file exceeds 50 MiB.')
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('The session file is not valid JSON.')
  }
  const data = object(value, 'Session export')
  if (data.schemaVersion !== 1 && data.schemaVersion !== 2 && data.schemaVersion !== 3)
    throw new Error('Unsupported session schema version. Expected version 1, 2 or 3.')
  keys(data, ['schemaVersion', 'exportedAt', 'session'], 'Session export', true)
  date(data.exportedAt, 'Export timestamp')
  return data.schemaVersion === 1
    ? migrateVersion1Session(data.session)
    : normalizeSession(data.session, true, data.schemaVersion as 2 | 3)
}
export function serializeSession(session: AnalysisSession): string {
  // Explicit whitelist drops runtime-only/extra properties before JSON encoding.
  const data: ExportedSession = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    session: normalizeSession(session, false),
  }
  const json = JSON.stringify(data, null, 2)
  if (new Blob([json]).size > MAX_SESSION_BYTES) throw new Error('Session export exceeds 50 MiB.')
  return json
}
export function downloadSession(session: AnalysisSession) {
  const json = serializeSession(session)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `interview-mirror-session-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
