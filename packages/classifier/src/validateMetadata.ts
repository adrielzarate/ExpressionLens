import { featureMetadata, featureNames } from './featureSchema'
import { object as record } from './object'

export function validateMetadata(value: unknown): void {
  const data = record(value, 'Dataset')
  const expected = featureMetadata()
  if (data.schemaVersion !== expected.schemaVersion)
    throw new Error('Incompatible dataset schema version. Expected version 1.')
  const schema = record(data.featureSchema, 'Feature schema')
  if (schema.version !== 1 || schema.type !== expected.featureSchema.type)
    throw new Error('Incompatible feature schema. Expected mediapipe-face-blendshapes v1.')
  const names = schema.featureNames
  if (
    !Array.isArray(names) ||
    names.length !== 52 ||
    featureNames.some((name, index) => names[index] !== name)
  ) {
    throw new Error(
      'Incompatible feature names or ordering. All 52 canonical names must match exactly.',
    )
  }
  const model = record(data.modelInfo, 'Model info')
  if (
    model.name !== expected.modelInfo.name ||
    model.version !== expected.modelInfo.version ||
    model.sha256 !== expected.modelInfo.sha256
  ) {
    throw new Error(
      'Incompatible model asset identifier or checksum. This dataset uses a different model.',
    )
  }
}
