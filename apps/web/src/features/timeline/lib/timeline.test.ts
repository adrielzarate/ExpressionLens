import { describe, expect, it } from 'vitest'
import type { AnalysisSession, ExpressionSample } from '../../analysis/types'
import { buildTimeline, eventNeighbors, findSampleIndex, formatTimestamp } from './timeline'

const detected = (
  timestampMs: number,
  label: 'neutral' | 'smile' | 'uncertain' = 'neutral',
): ExpressionSample => ({
  status: 'detected',
  timestampMs,
  label,
  rawLabel: label === 'uncertain' ? 'neutral' : label,
  isUncertain: label === 'uncertain',
  confidence: 0.55,
  margin: 0.11,
  distribution: [
    { label: 'neutral', probability: 0.55 },
    { label: 'smile', probability: 0.008 },
    { label: 'surprise', probability: 0.002 },
    { label: 'angry', probability: 0.44 },
  ],
})
const session = (
  samples: ExpressionSample[],
  durationMs = 1000,
  samplingFps = 5,
): AnalysisSession => ({
  id: 'test',
  createdAt: '',
  source: 'upload',
  durationMs,
  samplingFps,
  modelVersion: 'v3',
  samples,
})

describe('sampled expression intervals', () => {
  it('groups consecutive categories and preserves exact observations and fractional tail', () => {
    const samples = [
      detected(0),
      detected(200),
      detected(400, 'smile'),
      detected(600, 'uncertain'),
      { status: 'no-face' as const, timestampMs: 800 },
      { status: 'multiple-faces' as const, timestampMs: 1000 },
    ]
    const original = structuredClone(samples)
    const timeline = buildTimeline(session(samples, 1100))
    expect(timeline.intervals).toEqual([
      { startMs: 0, endMs: 400, category: 'neutral', sampleCount: 2 },
      { startMs: 400, endMs: 600, category: 'smile', sampleCount: 1 },
      { startMs: 600, endMs: 800, category: 'uncertain', sampleCount: 1 },
      { startMs: 800, endMs: 1000, category: 'no-face', sampleCount: 1 },
      { startMs: 1000, endMs: 1100, category: 'multiple-faces', sampleCount: 1 },
    ])
    expect(samples).toEqual(original)
    expect(timeline.samples).toBe(samples)
  })
  it('marks missing beginning, skipped periods and incomplete tails without inventing labels', () => {
    const timeline = buildTimeline(session([detected(200), detected(600)]))
    expect(timeline.intervals.map((row) => [row.startMs, row.endMs, row.category])).toEqual([
      [0, 200, 'not-analyzed'],
      [200, 400, 'neutral'],
      [400, 600, 'not-analyzed'],
      [600, 800, 'neutral'],
      [800, 1000, 'not-analyzed'],
    ])
    expect(timeline.events.map((row) => row.startMs)).toEqual([200, 600])
  })
  it('does not introduce gaps from fractional sampling periods or round boundaries', () => {
    for (const fps of [17, 30, 59.94]) {
      const samples = Array.from({ length: Math.ceil(fps) }, (_, i) => detected((i * 1000) / fps))
      const timeline = buildTimeline(session(samples, 1000, fps))
      expect(timeline.intervals).toEqual([
        { startMs: 0, endMs: 1000, category: 'neutral', sampleCount: samples.length },
      ])
    }
    const fractional = buildTimeline(session([detected(0), detected(199.9999999, 'smile')], 300))
    expect(fractional.intervals[0].endMs).toBe(199.9999999)
    expect(fractional.intervals[1].startMs).toBe(199.9999999)
  })
  it('shows a fully unobserved video without fabricating events', () => {
    const timeline = buildTimeline(session([]))
    expect(timeline.intervals).toEqual([
      { startMs: 0, endMs: 1000, category: 'not-analyzed', sampleCount: 0 },
    ])
    expect(timeline.events).toEqual([])
  })
  it('rejects invalid or out-of-order timestamps without mutating them', () => {
    for (const samples of [
      [detected(200), detected(0)],
      [detected(0), detected(0)],
      [detected(-1)],
      [detected(1000)],
      [detected(NaN)],
    ])
      expect(() => buildTimeline(session(samples))).toThrow('unique, increasing')
  })
})
describe('binary-search observation mapping', () => {
  const timeline = buildTimeline(
    session([detected(0), detected(200), detected(400), detected(600), detected(800)]),
  )
  it.each([
    [0, 0],
    [200, 1],
    [199, 0],
    [299, 1],
    [999, 4],
    [1000, 4],
    [1001, null],
    [-1, null],
  ])('maps %s milliseconds to observation %s', (time, index) => {
    expect(findSampleIndex(timeline, time)).toBe(index)
  })
  it('returns no prediction before the first observation, inside missing periods, or after unsupported tails', () => {
    const sparse = buildTimeline(session([detected(200), detected(600)]))
    for (const time of [0, 199, 400, 500, 800, 1000])
      expect(findSampleIndex(sparse, time)).toBeNull()
    expect(findSampleIndex(sparse, 200)).toBe(0)
    expect(findSampleIndex(buildTimeline(session([])), 500)).toBeNull()
  })
})
describe('expression events', () => {
  const events = buildTimeline(
    session([
      detected(0),
      detected(200),
      detected(400, 'smile'),
      detected(600, 'smile'),
      detected(800, 'uncertain'),
    ]),
  ).events
  it('avoids duplicate entries and navigates strict chronological starts', () => {
    expect(events.map((row) => row.startMs)).toEqual([0, 400, 800])
    expect(eventNeighbors(events, 0)).toEqual({ previous: null, next: 400 })
    expect(eventNeighbors(events, 400)).toEqual({ previous: 0, next: 800 })
    expect(eventNeighbors(events, 450)).toEqual({ previous: 400, next: 800 })
    expect(eventNeighbors(events, 800)).toEqual({ previous: 400, next: null })
    expect(eventNeighbors(events, 1000)).toEqual({ previous: 800, next: null })
    expect(eventNeighbors([], 500)).toEqual({ previous: null, next: null })
  })
  it('formats actual sample timestamps without losing milliseconds', () => {
    expect(formatTimestamp(42600)).toBe('00:42.600')
    expect(formatTimestamp(60000)).toBe('01:00.000')
  })
})
