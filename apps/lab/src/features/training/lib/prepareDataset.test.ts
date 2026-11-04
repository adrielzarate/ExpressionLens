import { describe, expect, it } from 'vitest'
import { trainingDataset } from '../test/fixtures'
import { prepareDataset } from './prepareDataset'
import { splitNames } from '../types/training'

const ids = (data: ReturnType<typeof prepareDataset>) =>
  Object.fromEntries(splitNames.map((name) => [name, data.splits[name].map((row) => row.id)]))
describe('training input and grouped stratification', () => {
  it('stratifies 200 independent identities reproducibly near 70/15/15, preserving original data', () => {
    const source = trainingDataset()
    const before = structuredClone(source)
    const prepared = prepareDataset(source)
    expect(prepared.report).toMatchObject({
      originalSamples: 200,
      usableSamples: 200,
      duplicatesExcluded: 0,
    })
    expect(splitNames.map((name) => prepared.summary[name].samples)).toEqual([140, 30, 30])
    expect(prepared.summary.train.perClass).toEqual([35, 35, 35, 35])
    expect(prepared.summary.validation.perClass.every((count) => count === 7 || count === 8)).toBe(
      true,
    )
    expect(ids(prepareDataset(source))).toEqual(ids(prepared))
    expect(ids(prepareDataset({ ...source, samples: [...source.samples].reverse() }))).toEqual(
      ids(prepared),
    )
    expect(ids(prepareDataset(source, 43))).not.toEqual(ids(prepared))
    expect(source).toEqual(before)
  })
  it('keeps repeated participants and their different expressions entirely in one split', () => {
    const prepared = prepareDataset(trainingDataset(20, true))
    const people = splitNames.map(
      (name) => new Set(prepared.splits[name].map((row) => row.participantId)),
    )
    expect([...people[0]].some((person) => people[1].has(person) || people[2].has(person))).toBe(
      false,
    )
    expect([...people[1]].some((person) => people[2].has(person))).toBe(false)
    expect(splitNames.map((name) => prepared.summary[name].participants)).toEqual([14, 3, 3])
    expect(splitNames.flatMap((name) => prepared.splits[name])).toHaveLength(80)
  })
  it('deduplicates globally before splitting and excludes all conflicting labels', () => {
    const source = trainingDataset(10)
    source.samples.push({ ...source.samples[0], id: 'copy-1', participantId: 'copy-person' })
    source.samples.push({ ...source.samples[1], id: 'conflict', label: 'angry' })
    const prepared = prepareDataset(source)
    expect(prepared.report).toMatchObject({
      originalSamples: 42,
      usableSamples: 39,
      duplicatesExcluded: 3,
      duplicateGroups: 2,
      conflictingGroups: 1,
      conflictingSamplesExcluded: 2,
    })
    const all = splitNames.flatMap((name) => prepared.splits[name])
    expect(new Set(all.map((row) => JSON.stringify(row.features))).size).toBe(all.length)
    expect(all.some((row) => row.id === 'conflict' || row.id === source.samples[1].id)).toBe(false)
    expect(source.samples).toHaveLength(42)
  })
  it('rejects invalid schemas, feature ordering, labels, IDs and numerical values', () => {
    const source = trainingDataset(10)
    expect(() => prepareDataset({ ...source, schemaVersion: 2 })).toThrow('schema version')
    expect(() =>
      prepareDataset({
        ...source,
        featureSchema: {
          ...source.featureSchema,
          featureNames: [...source.featureSchema.featureNames].reverse(),
        },
      }),
    ).toThrow('ordering')
    expect(() =>
      prepareDataset({ ...source, samples: [...source.samples, source.samples[0]] }),
    ).toThrow('Duplicate sample ID')
    expect(() =>
      prepareDataset({ ...source, samples: [{ ...source.samples[0], label: 'happy' }] }),
    ).toThrow('label')
    expect(() =>
      prepareDataset({
        ...source,
        samples: [{ ...source.samples[0], features: Array(52).fill(NaN) }],
      }),
    ).toThrow('52 finite')
  })
  it('requires at least three independent participants per class after deduplication', () => {
    expect(() => prepareDataset(trainingDataset(2))).toThrow('at least 3 distinct participants')
    const source = trainingDataset(10)
    source.samples.forEach((sample) => {
      sample.participantId = 'same-person'
    })
    expect(() => prepareDataset(source)).toThrow('at least 3 distinct participants')
  })
  it.each([-1, 0.5, NaN, Infinity, 4294967296])('rejects invalid split seed %s', (seed) => {
    expect(() => prepareDataset(trainingDataset(5), seed)).toThrow('Seed')
  })
})
