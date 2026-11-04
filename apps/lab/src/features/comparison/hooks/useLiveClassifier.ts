import { useEffect, useRef, useState } from 'react'
import type { FaceSnapshot } from '../../../types/face'
import type { LoadedClassifier, PairedPrediction, SmoothingLevel } from '../types/comparison'
import { createLivePredictor } from '../lib/livePredictor'

export function useLiveClassifier(
  model: LoadedClassifier | null,
  frame: FaceSnapshot,
  active: boolean,
  enabled: boolean,
  smoothing: SmoothingLevel,
) {
  const [result, setResult] = useState<PairedPrediction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<ReturnType<typeof createLivePredictor> | null>(null)
  useEffect(() => {
    const predictor = createLivePredictor(setResult, setError)
    controller.current = predictor
    return () => {
      predictor.dispose()
      controller.current = null
    }
  }, [])
  useEffect(() => {
    // Synchronize the external inference controller with model/camera settings.
    // oxlint-disable-next-line react/set-state-in-effect
    controller.current?.configure(model, smoothing, enabled, active)
  }, [model, smoothing, enabled, active])
  useEffect(() => {
    // Feed an immutable MediaPipe result, not a second camera or detection loop.
    // oxlint-disable-next-line react/set-state-in-effect
    controller.current?.frame(frame)
  }, [frame])
  return {
    prediction:
      active &&
      enabled &&
      frame.faceCount === 1 &&
      frame.timestampMs !== null &&
      model &&
      result?.modelId === model.id &&
      result.smoothing === smoothing
        ? result
        : null,
    error,
  }
}
