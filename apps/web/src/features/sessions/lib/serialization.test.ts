import { afterEach, expect, it, vi } from 'vitest'
import {
  downloadSession,
  MAX_SESSION_SAMPLES,
  parseSessionJSON,
  serializeSession,
} from './serialization'
import { sessionFixture } from '../test/fixtures'
import { sessionStatistics } from '../../analysis/lib/statistics'
import { buildTimeline, findSampleIndex } from '../../timeline/lib/timeline'
import type { AnalysisSession } from '../../analysis/types'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('round-trips schema v3, timestamps, all four probabilities, uncertainty and skipped statuses without precision loss', () => {
  const original = sessionFixture(),
    json = serializeSession(original),
    envelope = JSON.parse(json)
  expect(envelope.schemaVersion).toBe(3)
  expect(Number.isFinite(Date.parse(envelope.exportedAt))).toBe(true)
  expect(json).toContain('\n  "schemaVersion"')
  const restored = parseSessionJSON(json)
  expect(restored).toEqual(original)
  expect(sessionStatistics(restored)).toEqual(sessionStatistics(original))
  expect(buildTimeline(restored).intervals).toEqual(buildTimeline(original).intervals)
  expect(findSampleIndex(buildTimeline(restored), 650)).toBe(3)
})
it('excludes runtime-only and cyclic extras rather than serializing React/runtime objects', () => {
  const original = sessionFixture()
  const runtime: Record<string, unknown> = {
    src: 'blob:private',
    video: 'data:video/base64,private',
  }
  runtime.self = runtime
  const value = {
    ...original,
    runtime,
    tensor: runtime,
    video: { ...original.video!, objectURL: 'blob:private' },
    samples: original.samples.map((row) => ({ ...row, runtime })),
  }
  const json = serializeSession(value)
  expect(json).not.toMatch(/blob:|data:video|tensor|runtime|objectURL/)
  expect(parseSessionJSON(json)).toEqual(original)
})
it.each([
  [
    'unsupported version',
    (d: any) => {
      d.schemaVersion = 4
    },
  ],
  [
    'missing metadata',
    (d: any) => {
      delete d.session.video
    },
  ],
  [
    'missing ID',
    (d: any) => {
      delete d.session.id
    },
  ],
  [
    'invalid creation time',
    (d: any) => {
      d.session.createdAt = 'yesterday'
    },
  ],
  [
    'invalid source',
    (d: any) => {
      d.session.source = 'cloud'
    },
  ],
  [
    'unknown label',
    (d: any) => {
      d.session.samples[0].label = 'sad'
    },
  ],
  [
    'invalid detection status',
    (d: any) => {
      d.session.samples[0].status = 'ok'
    },
  ],
  [
    'invalid raw label',
    (d: any) => {
      d.session.samples[0].rawLabel = 'uncertain'
    },
  ],
  [
    'invalid uncertainty flag',
    (d: any) => {
      d.session.samples[0].isUncertain = false
    },
  ],
  [
    'out of range probability',
    (d: any) => {
      d.session.samples[0].distribution[0].probability = 1.1
    },
  ],
  [
    'non-numerical probability',
    (d: any) => {
      d.session.samples[0].distribution[0].probability = null
    },
  ],
  [
    'non-normalized probabilities',
    (d: any) => {
      d.session.samples[0].distribution[0].probability = 0.8
    },
  ],
  [
    'wrong class order',
    (d: any) => {
      d.session.samples[0].distribution.reverse()
    },
  ],
  [
    'inconsistent confidence',
    (d: any) => {
      d.session.samples[0].confidence = 0.9
    },
  ],
  [
    'inconsistent margin',
    (d: any) => {
      d.session.samples[0].margin = 0.9
    },
  ],
  [
    'negative timestamp',
    (d: any) => {
      d.session.samples[0].timestampMs = -1
    },
  ],
  [
    'sample at video end',
    (d: any) => {
      d.session.samples[4].timestampMs = 1000
    },
  ],
  [
    'unordered samples',
    (d: any) => {
      d.session.samples.reverse()
    },
  ],
  [
    'duplicate timestamps',
    (d: any) => {
      d.session.samples[1].timestampMs = 0
    },
  ],
  [
    'invalid duration',
    (d: any) => {
      d.session.durationMs = 0
    },
  ],
  [
    'invalid FPS',
    (d: any) => {
      d.session.samplingFps = 0
    },
  ],
  [
    'excessive FPS',
    (d: any) => {
      d.session.samplingFps = 1000
    },
  ],
  [
    'inconsistent video duration',
    (d: any) => {
      d.session.video.durationMs = 900
    },
  ],
  [
    'invalid resolution',
    (d: any) => {
      d.session.video.width = -1
    },
  ],
  [
    'embedded video field',
    (d: any) => {
      d.session.video.data = 'base64'
    },
  ],
  [
    'predictions on no-face',
    (d: any) => {
      d.session.samples[1].label = 'neutral'
    },
  ],
])('rejects %s without dropping or repairing the affected record', (_name, mutate) => {
  const value = JSON.parse(serializeSession(sessionFixture()))
  mutate(value)
  expect(() => parseSessionJSON(JSON.stringify(value))).toThrow()
})
it('rejects malformed JSON, empty samples and excessive sample counts', () => {
  expect(() => parseSessionJSON('{')).toThrow('valid JSON')
  expect(() => parseSessionJSON('{}')).toThrow('version')
  const original = sessionFixture()
  expect(() => serializeSession({ ...original, samples: [] })).toThrow('samples')
  expect(() =>
    serializeSession({
      ...original,
      samples: Array(MAX_SESSION_SAMPLES + 1).fill(original.samples[0]),
    }),
  ).toThrow('samples')
})
it('downloads a named JSON blob and revokes its temporary URL after initiation', () => {
  vi.useFakeTimers()
  const create = vi.fn((_blob: Blob) => 'blob:download'),
    revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toMatch(/^interview-mirror-session-\d{4}-\d{2}-\d{2}\.json$/)
    expect(this.isConnected).toBe(true)
  })
  downloadSession(sessionFixture())
  expect(click).toHaveBeenCalledOnce()
  expect(create.mock.calls[0][0]).toBeInstanceOf(Blob)
  expect(revoke).not.toHaveBeenCalled()
  vi.advanceTimersByTime(10_000)
  expect(revoke).toHaveBeenCalledWith('blob:download')
  expect(document.querySelector('a[download]')).toBeNull()
})
it('preserves historical interpretations without applying a different current inference policy', () => {
  const original = sessionFixture()
  const sample = original.samples[0]
  if (sample.status === 'detected') {
    sample.label = sample.rawLabel
    sample.isUncertain = false
  }
  expect(parseSessionJSON(serializeSession(original))).toEqual(original as AnalysisSession)
})
