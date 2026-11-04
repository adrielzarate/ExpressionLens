import type { NeuralPredictionLabel } from '@expressionlens/classifier'
import type { AnalysisSession, ExpressionSample } from '../../analysis/types'

export type TimelineCategory = NeuralPredictionLabel | 'no-face' | 'multiple-faces' | 'not-analyzed'
export interface ExpressionInterval {
  startMs: number
  endMs: number
  category: TimelineCategory
  sampleCount: number
}
export interface ExpressionTimeline {
  durationMs: number
  periodMs: number
  samples: readonly ExpressionSample[]
  intervals: ExpressionInterval[]
  events: ExpressionInterval[]
}
export function sampleCategory(sample: ExpressionSample): TimelineCategory {
  return sample.status === 'detected' ? sample.label : sample.status
}
function observationEnd(
  samples: readonly ExpressionSample[],
  index: number,
  durationMs: number,
  periodMs: number,
) {
  const start = samples[index].timestampMs,
    next = samples[index + 1]?.timestampMs
  // Snap only floating-point noise, not missing sampling periods. Exact stored
  // timestamps define transitions; no rounded seconds are used for geometry.
  const expectedEnd = start + periodMs
  const end = next !== undefined && next <= expectedEnd + 0.000001 ? next : expectedEnd
  return Math.abs(end - durationMs) <= 0.000001 ? durationMs : Math.min(durationMs, end)
}
export function buildTimeline(session: AnalysisSession): ExpressionTimeline {
  const { durationMs, samplingFps, samples } = session
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(samplingFps) ||
    samplingFps <= 0
  )
    throw new Error('Timeline requires a positive duration and sampling rate.')
  const periodMs = 1000 / samplingFps
  const intervals: ExpressionInterval[] = []
  const append = (
    startMs: number,
    endMs: number,
    category: TimelineCategory,
    sampleCount: number,
  ) => {
    if (endMs <= startMs) return
    const previous = intervals.at(-1)
    if (previous?.category === category && previous.endMs === startMs) {
      previous.endMs = endMs
      previous.sampleCount += sampleCount
    } else intervals.push({ startMs, endMs, category, sampleCount })
  }
  let cursor = 0
  samples.forEach((sample, index) => {
    if (
      !Number.isFinite(sample.timestampMs) ||
      sample.timestampMs < 0 ||
      sample.timestampMs >= durationMs ||
      (index > 0 && samples[index - 1].timestampMs >= sample.timestampMs)
    )
      throw new Error('Timeline samples must have unique, increasing timestamps inside the video.')
    append(cursor, sample.timestampMs, 'not-analyzed', 0)
    const end = observationEnd(samples, index, durationMs, periodMs)
    append(sample.timestampMs, end, sampleCategory(sample), 1)
    cursor = end
  })
  append(cursor, durationMs, 'not-analyzed', 0)
  return {
    durationMs,
    periodMs,
    samples,
    intervals,
    events: intervals.filter((interval) => interval.category !== 'not-analyzed'),
  }
}
// Interval policy: latest observation at/before time, for at most one sampling
// period (clipped by the next observation and duration). Gaps are never inferred.
export function findSampleIndex(timeline: ExpressionTimeline, timestampMs: number): number | null {
  if (!Number.isFinite(timestampMs) || timestampMs < 0 || timestampMs > timeline.durationMs)
    return null
  const { samples } = timeline
  let lo = 0,
    hi = samples.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (samples[mid].timestampMs <= timestampMs) lo = mid + 1
    else hi = mid
  }
  const index = lo - 1
  if (index < 0) return null
  const end = observationEnd(samples, index, timeline.durationMs, timeline.periodMs)
  return timestampMs < end || (timestampMs === timeline.durationMs && end === timeline.durationMs)
    ? index
    : null
}
// Previous/next event means strictly earlier/later observed interval start.
// At an event boundary Previous skips that boundary; within an event it returns
// its start. Missing-data regions do not become expression events.
export function eventNeighbors(events: readonly ExpressionInterval[], timestampMs: number) {
  let lo = 0,
    hi = events.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (events[mid].startMs < timestampMs) lo = mid + 1
    else hi = mid
  }
  const previous = lo > 0 ? events[lo - 1].startMs : null
  const next =
    events[lo]?.startMs === timestampMs
      ? (events[lo + 1]?.startMs ?? null)
      : (events[lo]?.startMs ?? null)
  return { previous, next }
}
export function formatTimestamp(milliseconds: number) {
  const total = Math.max(0, Math.round(milliseconds))
  return `${Math.floor(total / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((total / 1000) % 60)
    .toString()
    .padStart(2, '0')}.${(total % 1000).toString().padStart(3, '0')}`
}
