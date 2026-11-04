import * as tf from '@tensorflow/tfjs'
import { datasetMetadata } from '../../dataset/lib/featureSchema'
import { architecture, trainingLabels, splitNames } from '../types/training'
import type {
  EpochMetrics,
  PreparedDataset,
  TrainingConfig,
  TrainingResult,
  ExportArtifacts,
} from '../types/training'
import type { FacialExpressionSample } from '../../dataset/types/dataset'
import { classificationMetrics } from './metrics'
import { createEarlyStopping } from './earlyStopping'
import { validateSeed } from './random'
import { assertTrainingSplits } from './trainingGuards'

export function buildModel(seed: number): tf.Sequential {
  const model = tf.sequential()
  model.add(
    tf.layers.dense({
      inputShape: [52],
      units: 32,
      activation: 'relu',
      kernelInitializer: tf.initializers.glorotUniform({ seed }),
    }),
  )
  model.add(
    tf.layers.dense({
      units: 16,
      activation: 'relu',
      kernelInitializer: tf.initializers.glorotUniform({ seed: (seed + 1) >>> 0 }),
    }),
  )
  model.add(
    tf.layers.dense({
      units: 4,
      activation: 'softmax',
      kernelInitializer: tf.initializers.glorotUniform({ seed: (seed + 2) >>> 0 }),
    }),
  )
  return model
}
function tensors(rows: FacialExpressionSample[]): [tf.Tensor2D, tf.Tensor2D] {
  return tf.tidy(() => [
    tf.tensor2d(
      rows.map((row) => row.features),
      [rows.length, 52],
    ),
    tf.oneHot(
      tf.tensor1d(
        rows.map((row) => trainingLabels.indexOf(row.label)),
        'int32',
      ),
      4,
    ) as tf.Tensor2D,
  ])
}
function metric(logs: tf.Logs | undefined, ...names: string[]): number {
  for (const name of names) {
    const value = logs?.[name]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  throw new Error(`Missing or non-finite training metric: ${names[0]}.`)
}
export function validateTrainingConfig(config: TrainingConfig): void {
  validateSeed(config.seed)
  if (
    !Number.isFinite(config.learningRate) ||
    config.learningRate <= 0 ||
    !Number.isInteger(config.batchSize) ||
    config.batchSize < 1 ||
    !Number.isInteger(config.maxEpochs) ||
    config.maxEpochs < 1 ||
    config.maxEpochs > 100 ||
    !Number.isInteger(config.patience) ||
    config.patience < 1
  )
    throw new Error('Invalid training configuration.')
}

export async function trainModel(
  data: PreparedDataset,
  config: TrainingConfig,
  onEpoch: (metrics: EpochMetrics) => void = () => {},
  onEvaluating: () => void = () => {},
): Promise<TrainingResult> {
  validateTrainingConfig(config)
  if (data.seed !== config.seed) throw new Error('Training seed does not match the prepared split.')
  assertTrainingSplits(data)
  // CPU runs in a dedicated worker: no external WASM/CDN or WebGL state shared
  // with MediaPipe, and the browser UI remains on its own thread.
  await tf.setBackend('cpu')
  await tf.ready()
  const model = buildModel(config.seed)
  const optimizer = tf.train.adam(config.learningRate)
  const allocated: tf.Tensor[] = []
  let bestWeights: tf.Tensor[] = []
  const checkpoint = createEarlyStopping(config.patience)
  const history: EpochMetrics[] = []
  let stopReason: TrainingResult['stopReason'] = 'max-epochs'
  try {
    model.compile({ optimizer, loss: 'categoricalCrossentropy', metrics: ['accuracy'] })
    const [trainX, trainY] = tensors(data.splits.train)
    allocated.push(trainX, trainY)
    const [validationX, validationY] = tensors(data.splits.validation)
    allocated.push(validationX, validationY)
    await model.fit(trainX, trainY, {
      validationData: [validationX, validationY],
      batchSize: config.batchSize,
      epochs: config.maxEpochs,
      shuffle: false,
      verbose: 0,
      yieldEvery: 'never',
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          const metrics: EpochMetrics = {
            epoch: epoch + 1,
            loss: metric(logs, 'loss'),
            accuracy: metric(logs, 'acc', 'accuracy'),
            validationLoss: metric(logs, 'val_loss'),
            validationAccuracy: metric(logs, 'val_acc', 'val_accuracy'),
          }
          const state = checkpoint.observe(metrics.validationLoss, metrics.epoch)
          if (state.improved) {
            const snapshot = tf.tidy(() => model.getWeights().map((weight) => weight.clone()))
            tf.dispose(bestWeights)
            bestWeights = snapshot
          }
          history.push(metrics)
          onEpoch(metrics)
          if (state.shouldStop) {
            model.stopTraining = true
            stopReason = 'early-stopping'
          }
          // Yield between epochs even in workers; no dependence on rAF/iOS.
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
        },
      },
    })
    if (!bestWeights.length) throw new Error('No validation checkpoint was produced.')
    model.setWeights(bestWeights)
    onEvaluating()
    // Exactly one forward pass over held-out test samples, only after restoring
    // validation-selected weights. Test tensors never enter fit or early stop.
    const predictions = tf.tidy(() => {
      const x = tf.tensor2d(
        data.splits.test.map((row) => row.features),
        [data.splits.test.length, 52],
      )
      const output = model.predict(x)
      if (Array.isArray(output)) throw new Error('Unexpected classifier output.')
      return output.argMax(1)
    })
    let predicted: number[]
    try {
      predicted = Array.from(await predictions.data())
    } finally {
      predictions.dispose()
    }
    const metrics = classificationMetrics(
      data.splits.test.map((row) => trainingLabels.indexOf(row.label)),
      predicted,
    )
    let exported: ExportArtifacts | null = null
    await model.save(
      tf.io.withSaveHandler(async (artifacts) => {
        if (
          !artifacts.modelTopology ||
          artifacts.modelTopology instanceof ArrayBuffer ||
          !artifacts.weightSpecs ||
          !artifacts.weightData
        )
          throw new Error('Could not serialize the trained Layers model.')
        const weights = (
          Array.isArray(artifacts.weightData)
            ? tf.io.concatenateArrayBuffers(artifacts.weightData)
            : artifacts.weightData
        ).slice(0)
        exported = {
          weights,
          modelJson: JSON.stringify(
            {
              format: 'layers-model',
              generatedBy: `TensorFlow.js ${tf.version.tfjs}`,
              convertedBy: null,
              modelTopology: artifacts.modelTopology,
              weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }],
            },
            null,
            2,
          ),
        }
        return { modelArtifactsInfo: tf.io.getModelArtifactsInfoForJSON(artifacts) }
      }),
      { includeOptimizer: false },
    )
    if (!exported) throw new Error('Model export failed.')
    const artifacts = exported as ExportArtifacts
    const trainedAt = new Date().toISOString()
    const evaluationDomain =
      data.summary.test.real === 0
        ? 'synthetic'
        : data.summary.test.synthetic === 0
          ? 'real'
          : 'mixed'
    const metadataJson = JSON.stringify(
      {
        metadataVersion: 1,
        type: 'interview-mirror-facial-expression-classifier',
        architecture,
        labelOrder: [...trainingLabels],
        ...datasetMetadata(),
        preprocessing: { type: 'none', featureRange: [0, 1], featureCount: 52 },
        training: {
          ...config,
          optimizer: 'adam',
          loss: 'categoricalCrossentropy',
          metric: 'accuracy',
          monitor: 'val_loss',
          restoreBestWeights: true,
          shuffle: 'seeded-once-before-fit',
          backend: 'cpu',
          tensorflowVersion: tf.version.tfjs,
          actualEpochs: history.length,
          bestEpoch: checkpoint.bestEpoch,
          bestValidationLoss: checkpoint.bestLoss,
          stopReason,
        },
        splitting: {
          method: 'seeded-participant-grouped-stratification-v1',
          targetRatios: { train: 0.7, validation: 0.15, test: 0.15 },
          seed: data.seed,
          counts: data.summary,
          sampleIds: Object.fromEntries(
            splitNames.map((name) => [name, data.splits[name].map((row) => row.id)]),
          ),
          participantIds: Object.fromEntries(
            splitNames.map((name) => [
              name,
              [...new Set(data.splits[name].map((row) => row.participantId))],
            ]),
          ),
        },
        dataPreparation: data.report,
        testMetrics: metrics,
        evaluationDomain,
        limitations: [
          'Facial expression categories, not emotional state.',
          'Synthetic-data scores do not establish real-world performance.',
          'Test data was evaluated once after validation-only checkpoint selection.',
        ],
        trainedAt,
        history,
      },
      null,
      2,
    )
    return {
      artifacts,
      metadataJson,
      metrics,
      history,
      bestEpoch: checkpoint.bestEpoch,
      stopReason,
      trainedAt,
      evaluationDomain,
    }
  } finally {
    tf.dispose(allocated)
    tf.dispose(bestWeights)
    model.dispose()
    optimizer.dispose()
  }
}
