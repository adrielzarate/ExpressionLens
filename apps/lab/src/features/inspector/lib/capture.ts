import { canonicalFeatures, featureNames } from '../../dataset/lib/featureSchema'
import { expressionLabels } from '../../dataset/types/dataset'
import type { ExpressionLabel } from '../../dataset/types/dataset'
import { defaultThresholds, evaluateExpression } from '../../../lib/expressionRules'
import { faceModelInfo } from '../../../lib/mediapipe'
import type { FaceSnapshot } from '../../../types/face'
import type { LoadedClassifier } from '../../comparison/types/comparison'
import { mapProbabilities } from '../../comparison/lib/probabilities'
import type { InspectorSnapshot } from '../types'

export function captureReady(frame: FaceSnapshot, now = performance.now()): boolean {
  if (
    frame.faceCount !== 1 ||
    frame.faceDetected !== true ||
    frame.timestampMs === null ||
    !Number.isFinite(frame.timestampMs) ||
    now < frame.timestampMs ||
    now - frame.timestampMs > 500
  )
    return false
  try {
    canonicalFeatures(frame.blendshapes)
    return true
  } catch {
    return false
  }
}
export async function captureSnapshot(
  frame: FaceSnapshot,
  label: ExpressionLabel,
  description: string,
  model: LoadedClassifier | null,
  now = performance.now(),
): Promise<InspectorSnapshot> {
  if (!captureReady(frame, now))
    throw new Error('Capture requires one valid face and a fresh, complete frame (≤ 500 ms).')
  if (!expressionLabels.includes(label)) throw new Error('Select an intended expression.')
  if (description.length > 2000) throw new Error('Description must be at most 2000 characters.')
  // Copy before any await: later camera frames cannot change this snapshot.
  const features = canonicalFeatures(frame.blendshapes)
  const rule = evaluateExpression(featureNames.map((name, i) => ({ name, score: features[i] })))!
  const snapshot: InspectorSnapshot = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    frameTimestampMs: frame.timestampMs!,
    label,
    ...(description.trim() ? { description: description.trim() } : {}),
    features,
    modelInfo: { ...faceModelInfo },
    rule: { ...rule, thresholds: { ...defaultThresholds } },
    neural: { status: 'unavailable', reason: 'No neural model loaded.' },
  }
  if (model) {
    try {
      // Raw prediction, without temporal smoothing or a second MediaPipe call.
      const prediction = mapProbabilities(
        await model.predict([...features]),
        model.metadata.labelOrder,
      )
      snapshot.neural = {
        status: 'available',
        prediction,
        modelId: model.id,
        modelName: model.name,
        trainedAt: model.metadata.trainedAt,
      }
    } catch (cause) {
      snapshot.neural = {
        status: 'unavailable',
        reason:
          (cause instanceof Error ? cause.message.trim() : '').slice(0, 2000) ||
          'Neural inference failed.',
      }
    }
  }
  return snapshot
}
