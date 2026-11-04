import { describe, expect, it } from 'vitest'
import { emptySnapshot } from '../../../types/face'
import { featureNames } from './featureSchema'
import { sampleFromSnapshot } from './webcamCapture'
import type { CapturePlan } from './webcamCapture'

const snapshot = (timestampMs: number, faceCount = 1) => ({
  ...emptySnapshot(),
  timestampMs,
  faceCount,
  faceDetected: faceCount > 0,
  blendshapes: featureNames.map((name, index) => ({ name, score: index / 100 })).reverse(),
})
function plan(): CapturePlan {
  return {
    startsAt: 3000,
    endsAt: 6000,
    lastSampleAt: null,
    sessionId: 'session-1',
    identity: { participantId: 'person-1', label: 'angry', source: 'real' },
  }
}
describe('webcam collection window', () => {
  it('excludes countdown, end boundary, missing faces, and multiple faces', () => {
    const capture = plan()
    expect(sampleFromSnapshot(snapshot(2999), capture)).toBeNull()
    expect(sampleFromSnapshot(snapshot(6000), capture)).toBeNull()
    expect(sampleFromSnapshot(snapshot(3000, 0), capture)).toBeNull()
    expect(sampleFromSnapshot(snapshot(3000, 2), capture)).toBeNull()
    expect(sampleFromSnapshot(emptySnapshot(), capture)).toBeNull()
    expect(sampleFromSnapshot(snapshot(3000), capture)?.features).toHaveLength(52)
  })
  it('collects at most ~5 FPS and never samples a stale snapshot twice', () => {
    const capture = plan()
    const first = sampleFromSnapshot(snapshot(3000), capture)!
    expect(sampleFromSnapshot(snapshot(3000), capture)).toBeNull()
    expect(sampleFromSnapshot(snapshot(3100), capture)).toBeNull()
    const second = sampleFromSnapshot(snapshot(3200), capture)!
    expect(second.id).not.toBe(first.id)
    expect(second).toMatchObject({
      participantId: first.participantId,
      sessionId: first.sessionId,
      source: 'real',
      label: 'angry',
    })
    expect(first.features).toEqual(featureNames.map((_, index) => index / 100))
  })
  it('rejects invalid measurements without consuming the sampling interval', () => {
    const capture = plan()
    expect(() => sampleFromSnapshot({ ...snapshot(3000), blendshapes: [] }, capture)).toThrow('52')
    expect(capture.lastSampleAt).toBeNull()
  })
})
