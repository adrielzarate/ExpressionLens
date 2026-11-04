import type * as TF from '@tensorflow/tfjs'
import type { ClassifierFiles, ClassifierMetadata, LoadedClassifier } from './types'
import { validateClassifierMetadata, validateWeightFiles } from './compatibility'
import { mapProbabilities } from './probabilities'

let runtime: Promise<typeof TF> | null = null
async function tensorflow(): Promise<typeof TF> {
  runtime ??= import('@tensorflow/tfjs')
    .then(async (tf) => {
      await tf.setBackend('cpu')
      await tf.ready()
      return tf
    })
    .catch((error: unknown) => {
      runtime = null
      throw error
    })
  return runtime
}
export function validateLoadedArchitecture(
  model: TF.LayersModel,
  metadata: ClassifierMetadata,
): void {
  if (
    model.inputs.length !== 1 ||
    model.outputs.length !== 1 ||
    model.inputs[0].shape.length !== 2 ||
    model.inputs[0].shape[1] !== 52 ||
    (model.inputs[0].shape[0] !== null && model.inputs[0].shape[0] !== 1) ||
    model.outputs[0].shape.length !== 2 ||
    model.outputs[0].shape[1] !== 4
  )
    throw new Error('The loaded model must have one input [batch,52] and one output [batch,4].')
  if (model.layers.length !== metadata.architecture.layers.length)
    throw new Error('Model layers do not match the supplied architecture metadata.')
  model.layers.forEach((layer, index) => {
    const actual = layer.getConfig(),
      expected = metadata.architecture.layers[index]
    if (
      layer.getClassName() !== 'Dense' ||
      actual.units !== expected.units ||
      actual.activation !== expected.activation
    )
      throw new Error('Model layers or activations do not match the supplied metadata.')
  })
}

export function createClassifierSession(
  tf: typeof TF,
  model: TF.LayersModel,
  metadata: ClassifierMetadata,
  name: string,
): LoadedClassifier {
  let disposed = false,
    closed = false,
    inFlight = false
  const close = () => {
    if (disposed && !inFlight && !closed) {
      closed = true
      model.dispose()
    }
  }
  return {
    id: crypto.randomUUID(),
    name,
    metadata,
    async predict(features: number[]): Promise<number[]> {
      if (disposed) throw new Error('The classifier has been unloaded.')
      if (inFlight) throw new Error('An inference operation is already in progress.')
      if (
        features.length !== 52 ||
        features.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      )
        throw new Error('Inference requires 52 raw coefficients in [0,1].')
      inFlight = true
      let output: TF.Tensor | null = null
      try {
        output = tf.tidy(() => {
          const input = tf.tensor2d(features, [1, 52])
          const result = model.predict(input)
          if (
            Array.isArray(result) ||
            result.shape.length !== 2 ||
            result.shape[0] !== 1 ||
            result.shape[1] !== 4
          )
            throw new Error('Unexpected model output shape.')
          return result
        })
        const probabilities = Array.from(await output.data())
        mapProbabilities(probabilities, metadata.labelOrder)
        return probabilities
      } finally {
        output?.dispose()
        inFlight = false
        close()
      }
    },
    dispose() {
      disposed = true
      close()
    },
  }
}

export async function loadClassifier(files: ClassifierFiles): Promise<LoadedClassifier> {
  let metadataValue: unknown, modelJson: unknown
  try {
    metadataValue = JSON.parse(await files.metadata.text())
  } catch {
    throw new Error('The metadata file is not readable JSON.')
  }
  const metadata = validateClassifierMetadata(metadataValue)
  try {
    modelJson = JSON.parse(await files.model.text())
  } catch {
    throw new Error('The model file is not readable JSON.')
  }
  validateWeightFiles(modelJson, files.weights)
  const tf = await tensorflow()
  const model = await tf.loadLayersModel(tf.io.browserFiles([files.model, ...files.weights]))
  let session: LoadedClassifier | null = null
  try {
    validateLoadedArchitecture(model, metadata)
    session = createClassifierSession(tf, model, metadata, files.model.name)
    // Warm-up also checks that the serialized network really emits probabilities.
    await session.predict(Array(52).fill(0) as number[])
    return session
  } catch (error) {
    if (session) session.dispose()
    else model.dispose()
    throw error
  }
}
