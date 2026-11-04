import type { FacialExpressionSample, ImageImportMode, SampleIdentity } from '../types/dataset'
import { validateParticipantId, validateSample } from './datasetValidation'

export interface ImageBatch {
  mode: ImageImportMode
  participantId: string | null
  label: SampleIdentity['label']
  source: SampleIdentity['source']
  sessionId: string
}

export function createImageBatch(identity: SampleIdentity, mode: ImageImportMode): ImageBatch {
  if (mode === 'different-identities' && identity.source !== 'synthetic') {
    throw new Error(
      'Different identities mode is for synthetic images. Use Same identity for real participants.',
    )
  }
  return {
    mode,
    participantId:
      mode === 'same-identity' ? validateParticipantId(identity.participantId.trim()) : null,
    label: identity.label,
    source: identity.source,
    sessionId: crypto.randomUUID(),
  }
}

export function createImageSample(
  batch: ImageBatch,
  features: number[],
  sourceFileName: string,
): FacialExpressionSample {
  return validateSample({
    id: crypto.randomUUID(),
    // A cryptographic UUID per image, never a counter reset between batches.
    participantId:
      batch.mode === 'different-identities'
        ? `synthetic-${crypto.randomUUID()}`
        : batch.participantId,
    sessionId: batch.sessionId,
    label: batch.label,
    source: batch.source,
    features,
    sourceFileName,
    createdAt: new Date().toISOString(),
  })
}
