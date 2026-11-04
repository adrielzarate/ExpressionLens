import { describe, expect, it } from 'vitest'
import { createImageBatch, createImageSample } from './imageBatch'
import { datasetStatistics } from './datasetStatistics'
import { sample } from '../test/fixtures'
import { expressionLabels } from '../types/dataset'

describe('image batch identity modes', () => {
  it('assigns 200 unique participants across four synthetic expression batches without manual IDs', () => {
    const rows = expressionLabels.flatMap((label) => {
      const batch = createImageBatch(
        { participantId: '', label, source: 'synthetic' },
        'different-identities',
      )
      return Array.from({ length: 50 }, (_, index) =>
        createImageSample(batch, sample().features, `${label}-${index}.png`),
      )
    })
    expect(new Set(rows.map((row) => row.id)).size).toBe(200)
    expect(new Set(rows.map((row) => row.participantId)).size).toBe(200)
    expect(new Set(rows.map((row) => row.sessionId)).size).toBe(4)
    expect(rows.every((row) => row.source === 'synthetic' && row.features.length === 52)).toBe(true)
    expect(datasetStatistics(rows).classes).toEqual(
      expressionLabels.map((label) => ({ label, samples: 50, participants: 50 })),
    )
  })
  it('ignores a previous manual participant ID in different-identities mode', () => {
    const batch = createImageBatch(
      { participantId: 'person-001', label: 'angry', source: 'synthetic' },
      'different-identities',
    )
    const row = createImageSample(batch, sample().features, 'angry.png')
    expect(row.participantId).not.toBe('person-001')
    expect(row.participantId).toMatch(/^synthetic-/)
  })
  it('preserves a reusable participant ID across same-identity batches and expressions', () => {
    const first = createImageBatch(
      { participantId: ' person-001 ', label: 'smile', source: 'real' },
      'same-identity',
    )
    const second = createImageBatch(
      { participantId: 'person-001', label: 'angry', source: 'real' },
      'same-identity',
    )
    const rows = [
      createImageSample(first, sample().features, 'smile-1.png'),
      createImageSample(first, sample().features, 'smile-2.png'),
      createImageSample(second, sample().features, 'angry.png'),
    ]
    expect(new Set(rows.map((row) => row.participantId))).toEqual(new Set(['person-001']))
    expect(new Set(rows.map((row) => row.sessionId)).size).toBe(2)
    expect(rows.map((row) => row.label)).toEqual(['smile', 'smile', 'angry'])
  })
  it('requires a participant only in same-identity mode and keeps automatic identities synthetic', () => {
    expect(() =>
      createImageBatch({ participantId: '', label: 'neutral', source: 'real' }, 'same-identity'),
    ).toThrow('Participant ID')
    expect(() =>
      createImageBatch(
        { participantId: '', label: 'neutral', source: 'real' },
        'different-identities',
      ),
    ).toThrow('synthetic')
    expect(
      createImageBatch(
        { participantId: 'synthetic-person', label: 'neutral', source: 'synthetic' },
        'same-identity',
      ).participantId,
    ).toBe('synthetic-person')
  })
})
