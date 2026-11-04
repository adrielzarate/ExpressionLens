import * as tf from '@tensorflow/tfjs'
import { expect, it } from 'vitest'
import { loadClassifier } from './loadClassifier'
import { metadataValue } from '../test/fixtures'
import { buildModel } from '../../training/lib/trainModel'
import type { ClassifierFiles } from '../types/comparison'

async function exportedFiles(wrongShape = false): Promise<ClassifierFiles> {
  await tf.setBackend('cpu')
  await tf.ready()
  const model = wrongShape
    ? tf.sequential({
        layers: [tf.layers.dense({ inputShape: [51], units: 4, activation: 'softmax' })],
      })
    : buildModel(42)
  let json = '',
    buffer = new ArrayBuffer(0)
  try {
    await model.save(
      tf.io.withSaveHandler(async (artifacts) => {
        buffer = Array.isArray(artifacts.weightData)
          ? tf.io.concatenateArrayBuffers(artifacts.weightData)
          : artifacts.weightData!
        json = JSON.stringify({
          modelTopology: artifacts.modelTopology,
          weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }],
        })
        return { modelArtifactsInfo: tf.io.getModelArtifactsInfoForJSON(artifacts) }
      }),
    )
  } finally {
    model.dispose()
  }
  const modelFile = new File([json], 'model.json', { type: 'application/json' })
  const text = JSON.stringify(metadataValue())
  const metadata = new File([text], 'metadata.json', { type: 'application/json' })
  // jsdom File implements FileReader IO but not Blob.text on all versions.
  Object.defineProperty(modelFile, 'text', { value: async () => json })
  Object.defineProperty(metadata, 'text', { value: async () => text })
  return { model: modelFile, weights: [new File([buffer], 'weights.bin')], metadata }
}
it('loads actual exported files through browserFiles and does not leak tensors across repeated predictions', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const before = tf.memory().numTensors
  const loaded = await loadClassifier(await exportedFiles())
  const loadedCount = tf.memory().numTensors
  for (let i = 0; i < 30; i++) {
    const values = await loaded.predict(Array(52).fill(0.1) as number[])
    expect(values).toHaveLength(4)
    expect(values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
  }
  expect(tf.memory().numTensors).toBe(loadedCount)
  loaded.dispose()
  loaded.dispose()
  expect(tf.memory().numTensors).toBe(before)
  await expect(loaded.predict(Array(52).fill(0) as number[])).rejects.toThrow('unloaded')
})
it('guards overlapping predictions and defers model disposal until pending output is read', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const before = tf.memory().numTensors
  const loaded = await loadClassifier(await exportedFiles())
  const first = loaded.predict(Array(52).fill(0) as number[])
  const overlap = loaded.predict(Array(52).fill(0) as number[])
  loaded.dispose()
  await expect(overlap).rejects.toThrow('already in progress')
  await first
  expect(tf.memory().numTensors).toBe(before)
})
it('rejects the actual serialized wrong input shape and disposes the incompatible model', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const before = tf.memory().numTensors
  await expect(loadClassifier(await exportedFiles(true))).rejects.toThrow('[batch,52]')
  expect(tf.memory().numTensors).toBe(before)
})
