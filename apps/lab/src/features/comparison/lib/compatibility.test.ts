import { expect, it } from 'vitest'
import { validateClassifierMetadata, validateWeightFiles } from './compatibility'
import { metadataValue } from '../test/fixtures'

it('accepts the existing training export contract and preserves exact label/feature order', () => {
  const value = metadataValue()
  const metadata = validateClassifierMetadata(value)
  expect(metadata.labelOrder).toEqual(['neutral', 'smile', 'surprise', 'angry'])
  expect(metadata.featureSchema.featureNames).toEqual(value.featureSchema.featureNames)
  expect(metadata.preprocessing).toEqual(value.preprocessing)
})
it.each([
  { metadataVersion: 2 },
  { labelOrder: ['angry', 'neutral', 'smile', 'surprise'] },
  { labelOrder: ['neutral', 'smile', 'surprise', 'frown'] },
  { preprocessing: { type: 'standardize', featureCount: 52, featureRange: [0, 1] } },
  { modelInfo: undefined },
])('rejects incompatible or unverifiable metadata %j', (change) => {
  expect(() => validateClassifierMetadata({ ...metadataValue(), ...change })).toThrow()
})
it('rejects wrong input/output size, feature order, model version and checksum', () => {
  const data = metadataValue()
  expect(() =>
    validateClassifierMetadata({
      ...data,
      architecture: { ...data.architecture, inputShape: [51] },
    }),
  ).toThrow('52')
  expect(() =>
    validateClassifierMetadata({
      ...data,
      architecture: { ...data.architecture, layers: [{ units: 3, activation: 'softmax' }] },
    }),
  ).toThrow('4 softmax')
  expect(() =>
    validateClassifierMetadata({
      ...data,
      featureSchema: {
        ...data.featureSchema,
        featureNames: [...data.featureSchema.featureNames].reverse(),
      },
    }),
  ).toThrow('ordering')
  expect(() =>
    validateClassifierMetadata({ ...data, modelInfo: { ...data.modelInfo, version: 'other' } }),
  ).toThrow('cannot be verified')
  expect(() =>
    validateClassifierMetadata({ ...data, modelInfo: { ...data.modelInfo, sha256: '' } }),
  ).toThrow('cannot be verified')
})
it('supports multiple local weight shards and rejects missing, duplicate and remote paths', () => {
  const value = {
    modelTopology: {},
    weightsManifest: [
      {
        paths: ['weights-a.bin', './weights-b.bin'],
        weights: [{ name: 'test', shape: [2], dtype: 'bool' }],
      },
    ],
  }
  const files = [new File(['a'], 'weights-a.bin'), new File(['b'], 'weights-b.bin')]
  expect(() => validateWeightFiles(value, files)).not.toThrow()
  expect(() => validateWeightFiles(value, files.slice(0, 1))).toThrow('Missing weight files')
  expect(() =>
    validateWeightFiles(value, [new File(['truncated'], 'weights-a.bin'), files[1]]),
  ).toThrow('size does not match')
  expect(() => validateWeightFiles(value, [files[0], files[0]])).toThrow('Duplicate')
  expect(() =>
    validateWeightFiles(
      { ...value, weightsManifest: [{ paths: ['https://example.com/a.bin'], weights: [] }] },
      files,
    ),
  ).toThrow('local files')
})
