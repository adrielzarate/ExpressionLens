import { object, keys, numeric } from './validation'
import type { SessionVocal } from '../../vocal/types'
import { findVocalModel } from '../../vocal/models'
import { mapScores } from '../../vocal/lib/core'
function errorText(value: unknown) {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Invalid vocal error text.')
  return value
}
export function analysisSelection(value: unknown, strict: boolean) {
  const row = object(value, 'Selected analyses')
  keys(row, ['facial', 'speech', 'vocal'], 'Selected analyses', strict)
  if (
    typeof row.facial !== 'boolean' ||
    typeof row.speech !== 'boolean' ||
    typeof row.vocal !== 'boolean' ||
    !(row.facial || row.speech || row.vocal)
  )
    throw new Error('Select at least one analysis type.')
  return { facial: row.facial, speech: row.speech, vocal: row.vocal }
}
export function vocalRecord(value: unknown, durationMs: number, strict: boolean): SessionVocal {
  const row = object(value, 'Vocal analysis')
  keys(row, ['status', 'samples', 'error', 'metadata'], 'Vocal analysis', strict)
  if (!['not-requested', 'completed', 'partial', 'error', 'cancelled'].includes(String(row.status)))
    throw new Error('Invalid vocal status.')
  if (!Array.isArray(row.samples) || row.samples.length > 50_000)
    throw new Error('Invalid vocal sample count.')
  if (!['completed', 'partial'].includes(String(row.status)) && row.samples.length)
    throw new Error('Vocal samples require completed or partial status.')
  let metadata: SessionVocal['metadata']
  if (row.metadata !== undefined) {
    const m = object(row.metadata, 'Vocal metadata')
    keys(
      m,
      [
        'modelId',
        'revision',
        'dtype',
        'preprocessing',
        'backend',
        'labels',
        'sampleRate',
        'windowSeconds',
        'stepMs',
        'overlapMs',
        'silenceRms',
        'audioDurationMs',
        'loadMs',
        'inferenceMs',
      ],
      'Vocal metadata',
      strict,
    )
    const model = findVocalModel(m as { modelId: string; revision: string; dtype: string })
    if (
      !model ||
      (m.preprocessing !== undefined && m.preprocessing !== model.preprocessing) ||
      m.backend !== 'wasm' ||
      m.sampleRate !== 16000 ||
      ![3, 5, 10].includes(m.windowSeconds as number) ||
      m.overlapMs !== 0 ||
      m.stepMs !== (m.windowSeconds as number) * 1000 ||
      !Array.isArray(m.labels) ||
      m.labels.join(',') !== model.labels.join(',')
    )
      throw new Error('Unsupported vocal model or configuration.')
    metadata = {
      modelId: model.manifest.modelId,
      revision: model.manifest.revision,
      dtype: model.dtype,
      ...(m.preprocessing === undefined ? {} : { preprocessing: model.preprocessing }),
      backend: 'wasm',
      sampleRate: 16000,
      labels: [...model.labels],
      windowSeconds: m.windowSeconds as 3 | 5 | 10,
      stepMs: m.stepMs as number,
      overlapMs: 0,
      silenceRms: numeric(m.silenceRms, 'Silence threshold', 0, 0.1),
      audioDurationMs: numeric(m.audioDurationMs, 'Audio duration', Number.MIN_VALUE, 86_400_000),
      loadMs: numeric(m.loadMs, 'Vocal loading time', 0, Number.MAX_SAFE_INTEGER),
      inferenceMs: numeric(m.inferenceMs, 'Vocal inference time', 0, Number.MAX_SAFE_INTEGER),
    }
  }
  if (['completed', 'partial'].includes(String(row.status)) && (!metadata || !row.samples.length))
    throw new Error('Completed vocal analysis requires metadata and samples.')
  let previous = 0
  const samples = row.samples.map((value: unknown) => {
    const sample = object(value, 'Vocal sample')
    keys(
      sample,
      ['startMs', 'endMs', 'predictedLabel', 'scores', 'margin', 'status', 'error'],
      'Vocal sample',
      strict,
    )
    const startMs = numeric(sample.startMs, 'Vocal start', 0, durationMs),
      endMs = numeric(sample.endMs, 'Vocal end', 0, durationMs)
    if (endMs <= startMs || startMs < previous)
      throw new Error('Vocal intervals must be ordered and non-overlapping.')
    previous = endMs
    if (!['classified', 'silent', 'too-short', 'failed'].includes(String(sample.status)))
      throw new Error('Invalid vocal sample status.')
    const scores = object(sample.scores, 'Vocal scores')
    let prediction: {
      predictedLabel: string | null
      scores: Record<string, number>
      margin: number | null
    }
    if (sample.status === 'classified') {
      const labels = metadata?.labels
      if (!labels) throw new Error('Classified vocal samples require model metadata.')
      keys(scores, labels, 'Vocal scores', true)
      const mapped = mapScores(
        Object.entries(scores).map(([label, score]) => ({ label, score })),
        labels,
      )
      if (
        sample.predictedLabel !== mapped.predictedLabel ||
        typeof sample.margin !== 'number' ||
        Math.abs(sample.margin - mapped.margin!) > 1e-6 ||
        !Number.isFinite(sample.margin)
      )
        throw new Error('Vocal label or margin does not match its scores.')
      prediction = { ...mapped, margin: sample.margin }
    } else {
      if (sample.predictedLabel !== null || sample.margin !== null || Object.keys(scores).length)
        throw new Error('Unclassified vocal windows cannot contain predictions.')
      prediction = { predictedLabel: null, margin: null, scores: {} }
    }
    return {
      startMs,
      endMs,
      ...prediction,
      status: sample.status as SessionVocal['samples'][number]['status'],
      ...(sample.error === undefined ? {} : { error: errorText(sample.error) }),
    }
  })
  const failed = samples.some((s) => s.status === 'failed')
  if ((row.status === 'completed' && failed) || (row.status === 'partial' && !failed))
    throw new Error('Vocal completion status does not match failed windows.')
  return {
    status: row.status as SessionVocal['status'],
    samples,
    ...(metadata ? { metadata } : {}),
    ...(row.error === undefined ? {} : { error: errorText(row.error) }),
  }
}
