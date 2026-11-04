// @vitest-environment node
import * as tf from '@tensorflow/tfjs'
import { expect, it, vi } from 'vitest'
import { trainModel } from './trainModel'
import { prepareDataset } from './prepareDataset'
import { trainingDataset } from '../test/fixtures'
import { defaultTrainingConfig, trainingLabels } from '../types/training'

it('actually trains on CPU, evaluates test once, exports reloadable artifacts, and releases tensors', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const before = tf.memory().numTensors
  const data = prepareDataset(trainingDataset(8))
  const progress = vi.fn(),
    evaluating = vi.fn()
  const predict = vi.spyOn(tf.Sequential.prototype, 'predict')
  const result = await trainModel(
    data,
    { ...defaultTrainingConfig, maxEpochs: 3 },
    progress,
    evaluating,
  )
  expect(result.history).toHaveLength(3)
  expect(progress).toHaveBeenCalledTimes(3)
  expect(evaluating).toHaveBeenCalledOnce()
  expect(predict).toHaveBeenCalledOnce()
  expect(result.metrics.sampleCount).toBe(data.splits.test.length)
  expect(result.evaluationDomain).toBe('synthetic')
  expect(result.bestEpoch).toBe(
    result.history.reduce((best, row) => (row.validationLoss < best.validationLoss ? row : best))
      .epoch,
  )
  const metadata = JSON.parse(result.metadataJson)
  expect(metadata.labelOrder).toEqual(trainingLabels)
  expect(metadata.featureSchema.featureNames).toHaveLength(52)
  expect(metadata.modelInfo.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(metadata.training).toMatchObject({ restoreBestWeights: true, seed: 42, backend: 'cpu' })
  expect(metadata.testMetrics).toEqual(result.metrics)
  expect(metadata.splitting.counts.test.samples).toBe(data.splits.test.length)
  expect(tf.memory().numTensors).toBe(before)
  const json = JSON.parse(result.artifacts.modelJson)
  expect(json.weightsManifest[0].paths).toEqual(['weights.bin'])
  const model = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights,
      weightData: result.artifacts.weights,
    }),
  )
  expect(model.inputs[0].shape).toEqual([null, 52])
  expect(model.outputs[0].shape).toEqual([null, 4])
  expect(model.layers.map((layer) => layer.getConfig().units)).toEqual([32, 16, 4])
  expect(model.layers.map((layer) => layer.getConfig().activation)).toEqual([
    'relu',
    'relu',
    'softmax',
  ])
  model.dispose()
  expect(tf.memory().numTensors).toBe(before)
})
it('restores the best snapshot rather than exporting the last epoch weights', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const before = tf.memory().numTensors
  vi.spyOn(tf.Sequential.prototype, 'fit').mockImplementation(async function (
    this: tf.Sequential,
    _x,
    _y,
    options,
  ) {
    const callback = options?.callbacks
    if (!callback || Array.isArray(callback) || typeof callback.onEpochEnd !== 'function')
      throw new Error('Expected epoch callback')
    for (let epoch = 0; epoch < 3; epoch++) {
      tf.tidy(() => {
        this.setWeights(this.getWeights().map((weight) => tf.fill(weight.shape, epoch + 1)))
      })
      await callback.onEpochEnd(epoch, {
        loss: 0.5,
        acc: 0.5,
        val_loss: [0.4, 0.6, 0.8][epoch],
        val_acc: 0.5,
      })
      if (this.stopTraining) break
    }
    return { epoch: [0, 1, 2], history: {} } as tf.History
  })
  const result = await trainModel(prepareDataset(trainingDataset(5)), {
    ...defaultTrainingConfig,
    patience: 2,
  })
  expect(result.bestEpoch).toBe(1)
  expect(result.stopReason).toBe('early-stopping')
  const json = JSON.parse(result.artifacts.modelJson)
  const model = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights,
      weightData: result.artifacts.weights,
    }),
  )
  for (const weight of model.getWeights())
    expect(Array.from(await weight.data()).every((value) => value === 1)).toBe(true)
  model.dispose()
  expect(tf.memory().numTensors).toBe(before)
})
