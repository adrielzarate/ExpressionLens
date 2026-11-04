import { describe, expect, it } from 'vitest'
import { canonicalFeatures, featureNames } from './featureSchema'
import {
  parseDatasetJson,
  planDatasetImport,
  validateDataset,
  validateSample,
} from './datasetValidation'
import { exportDatasetJson } from './datasetExport'
import { datasetStatistics } from './datasetStatistics'
import { dataset, sample } from '../test/fixtures'

describe('canonical feature schema', () => {
  it('contains the explicit, unique 52 names and reorders actual categories by name', () => {
    expect(featureNames).toHaveLength(52)
    expect(new Set(featureNames).size).toBe(52)
    expect(featureNames[0]).toBe('_neutral')
    expect(featureNames[51]).toBe('noseSneerRight')
    const values = featureNames.map((name, index) => ({ name, score: index / 100 })).reverse()
    expect(canonicalFeatures(values)).toEqual(sample().features)
  })
  it('rejects duplicate, missing, unknown and invalid coefficients', () => {
    const values = featureNames.map((name, index) => ({ name, score: index / 100 }))
    expect(() => canonicalFeatures(values.slice(1))).toThrow('52')
    expect(() => canonicalFeatures([...values.slice(1), values[1]])).toThrow('Duplicate')
    expect(() => canonicalFeatures([...values.slice(1), { name: 'unknown', score: 0 }])).toThrow(
      'Missing',
    )
    expect(() => canonicalFeatures([...values.slice(1), { name: '_neutral', score: NaN }])).toThrow(
      'Invalid',
    )
  })
})

describe('dataset JSON compatibility and validation', () => {
  it('round trips all sample and dataset metadata without mutating input', () => {
    const rows = [
      sample(),
      sample({
        id: 'sample-2',
        source: 'real',
        label: 'angry',
        participantId: 'person-2',
        sessionId: 'session-2',
      }),
    ]
    const before = structuredClone(rows)
    const json = exportDatasetJson(rows, new Date('2026-10-31T08:00:00.000Z'))
    expect(parseDatasetJson(json)).toEqual(dataset(rows))
    expect(rows).toEqual(before)
    expect(JSON.parse(json).featureSchema.featureNames).toEqual(featureNames)
  })
  it.each([
    [],
    Array(52),
    Array(51).fill(0),
    Array(53).fill(0),
    [...Array(51).fill(0), NaN],
    [...Array(51).fill(0), Infinity],
    [...Array(51).fill(0), '0.5'],
    [...Array(51).fill(0), -0.1],
    [...Array(51).fill(0), 1.1],
  ])('rejects invalid feature vectors: %j', (features) => {
    expect(() => validateSample({ ...sample(), features })).toThrow('52 finite numbers')
  })
  it.each([
    { label: 'happy' },
    { source: 'photo' },
    { participantId: '' },
    { participantId: ' person-1' },
    { participantId: 'person\u0000' },
    { sessionId: '' },
    { id: '' },
    { createdAt: 'yesterday' },
  ])('rejects invalid sample metadata %j', (changes) => {
    expect(() => validateSample({ ...sample(), ...changes })).toThrow()
  })
  it('does not import extra photo or video payloads into a sample', () => {
    expect(
      validateSample({ ...sample(), image: 'data:image/png;base64,private', video: new Blob() }),
    ).toEqual(sample())
  })
  it.each([0, 2, '1', undefined])('rejects incompatible dataset version %s', (schemaVersion) => {
    expect(() => validateDataset({ ...dataset(), schemaVersion })).toThrow('schema version')
  })
  it('rejects reordered names, feature schema changes, and different model assets', () => {
    const data = dataset()
    expect(() =>
      validateDataset({
        ...data,
        featureSchema: { ...data.featureSchema, featureNames: [...featureNames].reverse() },
      }),
    ).toThrow('ordering')
    expect(() =>
      validateDataset({ ...data, featureSchema: { ...data.featureSchema, version: 2 } }),
    ).toThrow('feature schema')
    expect(() =>
      validateDataset({ ...data, modelInfo: { ...data.modelInfo, version: 'unknown' } }),
    ).toThrow('model asset')
    expect(() =>
      validateDataset({ ...data, modelInfo: { ...data.modelInfo, sha256: 'changed' } }),
    ).toThrow('model asset')
  })
  it('rejects malformed JSON, non-object data, malformed arrays and duplicate IDs', () => {
    expect(() => parseDatasetJson('{broken')).toThrow('not valid JSON')
    expect(() => validateDataset(null)).toThrow('object')
    expect(() => validateDataset({ ...dataset(), samples: {} })).toThrow('array')
    expect(() => validateDataset(dataset([sample(), sample()]))).toThrow('Duplicate sample ID')
  })
  it('previews existing-ID duplicates and adds only new IDs without overwriting', () => {
    const imported = dataset([sample({ label: 'angry' }), sample({ id: 'sample-2' })])
    const plan = planDatasetImport(imported, ['sample-1'])
    expect(plan.duplicateCount).toBe(1)
    expect(plan.total).toBe(2)
    expect(plan.additions.map((row) => row.id)).toEqual(['sample-2'])
  })
})

describe('statistics and participant-level quality', () => {
  it('counts distinct people and sessions, not consecutive frames', () => {
    const stats = datasetStatistics([
      sample(),
      sample({ id: '2' }),
      sample({ id: '3', label: 'smile', sessionId: 'session-2', source: 'real' }),
      sample({ id: '4', label: 'smile', participantId: 'person-2', source: 'real' }),
    ])
    expect(stats).toMatchObject({ total: 4, participants: 2, sessions: 2, synthetic: 2, real: 2 })
    expect(stats.classes.find((row) => row.label === 'smile')).toMatchObject({
      samples: 2,
      participants: 2,
    })
    expect(stats.classes.find((row) => row.label === 'neutral')).toMatchObject({
      samples: 2,
      participants: 1,
    })
  })
  it('warns for one participant and sparse or missing classes', () => {
    const stats = datasetStatistics([sample(), sample({ id: '2', source: 'real' })])
    expect(stats.warnings).toHaveLength(5)
    expect(stats.warnings[0]).toContain('Only one participant')
    expect(datasetStatistics([]).warnings).toHaveLength(4)
  })
})

it('maps legacy frown JSON samples to angry and exports only canonical labels without losing metadata', () => {
  const legacy = { ...dataset(), samples: [{ ...sample(), label: 'frown' }] }
  const imported = parseDatasetJson(JSON.stringify(legacy))
  expect(imported.samples).toEqual([sample({ label: 'angry' })])
  const json = exportDatasetJson(imported.samples)
  expect(JSON.parse(json).samples[0].label).toBe('angry')
  expect(json).not.toContain('"frown"')
  expect(
    datasetStatistics(imported.samples).classes.find((row) => row.label === 'angry')?.samples,
  ).toBe(1)
})
