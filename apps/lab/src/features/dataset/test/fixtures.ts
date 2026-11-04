import { featureNames, datasetMetadata } from '../lib/featureSchema'
import type { FacialExpressionDataset, FacialExpressionSample } from '../types/dataset'

export function sample(overrides: Partial<FacialExpressionSample> = {}): FacialExpressionSample {
  return {
    id: 'sample-1',
    participantId: 'person-1',
    sessionId: 'session-1',
    label: 'neutral',
    features: featureNames.map((_, index) => index / 100),
    source: 'synthetic',
    createdAt: '2026-10-31T08:00:00.000Z',
    sourceFileName: 'person-1-neutral.png',
    ...overrides,
  }
}
export function dataset(samples = [sample()]): FacialExpressionDataset {
  return { ...datasetMetadata(), exportedAt: '2026-10-31T08:00:00.000Z', samples }
}
