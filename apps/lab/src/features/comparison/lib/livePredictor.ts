import { classifyExpression } from '../../../lib/expressionRules'
import type { FaceSnapshot } from '../../../types/face'
import type { LoadedClassifier, PairedPrediction, SmoothingLevel } from '../types/comparison'
import { orderedFeatures, mapProbabilities } from './probabilities'
import { createSmoother } from './smoothing'

export function createLivePredictor(
  onResult: (result: PairedPrediction | null) => void,
  onError: (error: string | null) => void,
) {
  let model: LoadedClassifier | null = null,
    latest: FaceSnapshot | null = null
  let level: SmoothingLevel = 'medium',
    enabled = false,
    active = false
  let busy = false,
    disposed = false,
    version = 0
  let lastTimestamp: number | null = null
  const smoother = createSmoother()
  const valid = (
    frame: FaceSnapshot | null,
  ): frame is FaceSnapshot & { timestampMs: number; faceCount: 1; faceDetected: true } =>
    !!frame &&
    frame.faceCount === 1 &&
    frame.faceDetected === true &&
    frame.timestampMs !== null &&
    Number.isFinite(frame.timestampMs) &&
    performance.now() - frame.timestampMs < 1500
  const pump = () => {
    if (
      disposed ||
      busy ||
      !model ||
      !enabled ||
      !active ||
      !valid(latest) ||
      latest.timestampMs === lastTimestamp
    )
      return
    const frame = latest,
      currentModel = model,
      currentVersion = version,
      currentLevel = level
    lastTimestamp = frame.timestampMs
    busy = true
    void (async () => {
      const features = orderedFeatures(
        frame.blendshapes,
        currentModel.metadata.featureSchema.featureNames,
      )
      const started = performance.now()
      const values = await currentModel.predict(features)
      const inferenceMs = performance.now() - started
      if (disposed || currentVersion !== version || !valid(latest) || !valid(frame)) return
      const raw = mapProbabilities(values, currentModel.metadata.labelOrder)
      const primary = mapProbabilities(
        smoother.apply(values, currentLevel, frame.timestampMs!),
        currentModel.metadata.labelOrder,
      )
      const rule = classifyExpression(frame.blendshapes)
      if (!rule) throw new Error('Rule-based inputs are missing from the shared frame.')
      onError(null)
      onResult({
        frame,
        rule,
        raw,
        primary,
        inferenceMs,
        modelId: currentModel.id,
        modelName: currentModel.name,
        modelTrainedAt: currentModel.metadata.trainedAt,
        smoothing: currentLevel,
      })
    })()
      .catch((cause: unknown) => {
        if (disposed || currentVersion !== version) return
        smoother.reset()
        onResult(null)
        onError(cause instanceof Error ? cause.message : 'Neural network inference failed.')
      })
      .finally(() => {
        busy = false
        pump()
      })
  }
  return {
    configure(
      nextModel: LoadedClassifier | null,
      smoothing: SmoothingLevel,
      nextEnabled: boolean,
      cameraActive: boolean,
    ) {
      if (disposed) return
      if (
        nextModel !== model ||
        smoothing !== level ||
        nextEnabled !== enabled ||
        cameraActive !== active
      ) {
        version++
        lastTimestamp = null
        smoother.reset()
        onResult(null)
        onError(null)
        model = nextModel
        level = smoothing
        enabled = nextEnabled
        active = cameraActive
      }
      pump()
    },
    frame(frame: FaceSnapshot) {
      if (disposed) return
      latest = frame
      if (!valid(frame)) {
        version++
        lastTimestamp = null
        onResult(null)
        if (frame.faceCount > 1 || frame.timestampMs === null) smoother.reset()
      } else pump()
    },
    dispose() {
      disposed = true
      version++
      model = null
      latest = null
      smoother.reset()
    },
  }
}
