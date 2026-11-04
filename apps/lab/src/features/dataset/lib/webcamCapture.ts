import { canonicalFeatures } from './featureSchema'
import type { FaceSnapshot } from '../../../types/face'
import type { FacialExpressionSample, SampleIdentity } from '../types/dataset'

export interface CapturePlan {
  identity: SampleIdentity
  sessionId: string
  startsAt: number
  endsAt: number
  lastSampleAt: number | null
}
export function sampleFromSnapshot(
  snapshot: FaceSnapshot,
  plan: CapturePlan,
): FacialExpressionSample | null {
  const timestamp = snapshot.timestampMs
  if (
    timestamp === null ||
    timestamp < plan.startsAt ||
    timestamp >= plan.endsAt ||
    snapshot.faceCount !== 1
  )
    return null
  if (plan.lastSampleAt !== null && timestamp - plan.lastSampleAt < 199) return null
  const features = canonicalFeatures(snapshot.blendshapes)
  plan.lastSampleAt = timestamp
  return {
    id: crypto.randomUUID(),
    ...plan.identity,
    source: 'real',
    sessionId: plan.sessionId,
    features,
    createdAt: new Date().toISOString(),
  }
}
