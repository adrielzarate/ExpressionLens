import { expect, it } from 'vitest'
import { mapProbabilities } from '@expressionlens/classifier'
import { sessionStatistics } from './statistics'
import type { AnalysisSession, ExpressionSample } from '../types'

const session = (samples: ExpressionSample[]): AnalysisSession => ({
  id: 'test',
  createdAt: new Date().toISOString(),
  source: 'upload',
  modelVersion: 'v3',
  durationMs: 1000,
  samplingFps: 5,
  samples,
})
it('keeps all four classes and uncertainty, with an explicit detected-only expression denominator', () => {
  const samples: ExpressionSample[] = [0, 1, 2, 3].map((index) => ({
    status: 'detected',
    timestampMs: index * 200,
    ...mapProbabilities(
      [0, 1, 2, 3].map((i) => (i === index ? 0.85 : 0.05)),
      ['neutral', 'smile', 'surprise', 'angry'],
    ),
  }))
  samples.push({ status: 'no-face', timestampMs: 800 })
  const stats = sessionStatistics(session(samples))
  expect(stats.coverage).toBe(0.8)
  expect(stats.counts).toEqual({ neutral: 1, smile: 1, surprise: 1, angry: 1, uncertain: 0 })
  expect(stats.distribution[0].fraction).toBe(0.25)
})
it('does not invent percentages when no face was classified', () => {
  expect(sessionStatistics(session([])).coverage).toBeNull()
  const stats = sessionStatistics(session([{ status: 'no-face', timestampMs: 0 }]))
  expect(stats.coverage).toBe(0)
  expect(stats.distribution.every((row) => row.fraction === null && row.count === 0)).toBe(true)
})
