import { validateMetadata } from './validateMetadata'
import { expressionLabels as trainingLabels } from './types'
import { faceModelInfo } from './modelInfo'
import type { ClassifierMetadata } from './types'

import { object } from './object'
export { object } from './object'

export function validateClassifierMetadata(value: unknown): ClassifierMetadata {
  const data = object(value, 'Classifier metadata')
  if (data.metadataVersion !== 1 || data.type !== 'interview-mirror-facial-expression-classifier')
    throw new Error(
      'Unsupported classifier metadata format/version. Choose metadata exported by Training.',
    )
  const identity = object(data.modelInfo, 'MediaPipe model identity (required)')
  if (
    identity.name !== faceModelInfo.name ||
    identity.version !== faceModelInfo.version ||
    identity.sha256 !== faceModelInfo.sha256
  )
    throw new Error(
      'MediaPipe model identity cannot be verified: name, asset version and SHA-256 must match this application.',
    )
  validateMetadata(data)
  if (
    !Array.isArray(data.labelOrder) ||
    data.labelOrder.length !== 4 ||
    trainingLabels.some((label, index) => (data.labelOrder as unknown[])[index] !== label)
  )
    throw new Error('Label order must be exactly neutral, smile, surprise, angry.')
  const preprocessing = object(data.preprocessing, 'Preprocessing configuration')
  if (
    preprocessing.type !== 'none' ||
    preprocessing.featureCount !== 52 ||
    !Array.isArray(preprocessing.featureRange) ||
    preprocessing.featureRange.length !== 2 ||
    preprocessing.featureRange[0] !== 0 ||
    preprocessing.featureRange[1] !== 1
  )
    throw new Error(
      'Unsupported preprocessing. This application requires 52 raw [0,1] coefficients with no scaling or normalization.',
    )
  const architecture = object(data.architecture, 'Classifier architecture')
  if (
    architecture.type !== 'sequential-mlp' ||
    !Array.isArray(architecture.inputShape) ||
    architecture.inputShape.length !== 1 ||
    architecture.inputShape[0] !== 52 ||
    !Array.isArray(architecture.layers) ||
    !architecture.layers.length
  )
    throw new Error('Incompatible architecture. Expected a sequential MLP with 52 input values.')
  const layers = architecture.layers.map((layer: unknown) => {
    const config = object(layer, 'Layer configuration')
    if (
      typeof config.units !== 'number' ||
      !Number.isInteger(config.units) ||
      config.units < 1 ||
      typeof config.activation !== 'string' ||
      !config.activation
    )
      throw new Error('Invalid dense-layer metadata.')
    return { units: config.units, activation: config.activation }
  })
  if (layers[layers.length - 1].units !== 4 || layers[layers.length - 1].activation !== 'softmax')
    throw new Error('Incompatible output architecture. Expected 4 softmax probabilities.')
  return {
    schemaVersion: 1,
    metadataVersion: 1,
    type: 'interview-mirror-facial-expression-classifier',
    featureSchema: {
      version: 1,
      type: 'mediapipe-face-blendshapes',
      featureNames: [...(object(data.featureSchema, 'Feature schema').featureNames as string[])],
    },
    modelInfo: { ...faceModelInfo },
    labelOrder: [...data.labelOrder] as ClassifierMetadata['labelOrder'],
    architecture: { type: 'sequential-mlp', inputShape: [52], layers },
    preprocessing: { type: 'none', featureCount: 52, featureRange: [0, 1] },
    trainedAt: typeof data.trainedAt === 'string' ? data.trainedAt : null,
    evaluationDomain: typeof data.evaluationDomain === 'string' ? data.evaluationDomain : null,
  }
}

export function validateWeightFiles(modelJson: unknown, weights: readonly File[]): void {
  const model = object(modelJson, 'Model JSON')
  if (
    !model.modelTopology ||
    !Array.isArray(model.weightsManifest) ||
    !model.weightsManifest.length
  )
    throw new Error('The selected model JSON is missing its topology or weights manifest.')
  const expected = new Set<string>()
  let expectedBytes = 0
  let fixedSize = true
  for (const group of model.weightsManifest) {
    const manifest = object(group, 'Weights manifest group')
    if (
      !Array.isArray(manifest.paths) ||
      !manifest.paths.length ||
      !Array.isArray(manifest.weights)
    )
      throw new Error('Invalid weights manifest.')
    for (const entry of manifest.weights) {
      const weight = object(entry, 'Weight specification')
      if (
        !Array.isArray(weight.shape) ||
        weight.shape.some(
          (dimension: unknown) =>
            typeof dimension !== 'number' || !Number.isSafeInteger(dimension) || dimension < 0,
        )
      )
        throw new Error('Invalid weight shape in model manifest.')
      const quantization = weight.quantization
        ? object(weight.quantization, 'Weight quantization')
        : null
      const bytesPerElement = quantization
        ? ({ uint8: 1, uint16: 2, float16: 2 } as Record<string, number>)[
            String(quantization.dtype)
          ]
        : ({ float32: 4, int32: 4, bool: 1, complex64: 8 } as Record<string, number>)[
            String(weight.dtype)
          ]
      if (!bytesPerElement) fixedSize = false
      else {
        expectedBytes +=
          weight.shape.reduce((size: number, dimension: number) => size * dimension, 1) *
          bytesPerElement
        if (!Number.isSafeInteger(expectedBytes))
          throw new Error('Weight dimensions exceed supported file sizes.')
      }
    }
    for (const path of manifest.paths) {
      if (
        typeof path !== 'string' ||
        !path ||
        /[:?#\\]/.test(path) ||
        path.startsWith('/') ||
        path.split('/').includes('..')
      )
        throw new Error('Weights must reference local files, not URLs or parent paths.')
      const name = path.split('/').pop()!
      if (!name || expected.has(name))
        throw new Error('Weight manifest contains duplicate or invalid filenames.')
      expected.add(name)
    }
  }
  const selected = new Set(weights.map((file) => file.name))
  if (selected.size !== weights.length) throw new Error('Duplicate weight filenames were selected.')
  const missing = [...expected].filter((name) => !selected.has(name))
  if (missing.length)
    throw new Error(
      `Missing weight files: ${missing.join(', ')}. Select the files referenced by model.json.`,
    )
  if (weights.length !== expected.size)
    throw new Error('Select only the weight files referenced by model.json.')
  if (fixedSize && weights.reduce((sum, file) => sum + file.size, 0) !== expectedBytes)
    throw new Error(
      `Weight file size does not match the manifest (${expectedBytes} bytes required). Choose files from the same exported run.`,
    )
}
