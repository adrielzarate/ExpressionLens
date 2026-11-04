import { useEffect, useRef, useState } from 'react'
import { useCamera } from '../../../hooks/useCamera'
import { useFaceLandmarker } from '../../../hooks/useFaceLandmarker'
import { CameraPreview } from '../../../components/CameraPreview'
import { BlendshapeInspector } from '../../../components/BlendshapeInspector'
import { useClassifierModel } from '../../comparison/hooks/useClassifierModel'
import { ModelLoader } from '../../comparison/components/ModelLoader'
import { expressionLabels } from '../../dataset/types/dataset'
import type { ExpressionLabel } from '../../dataset/types/dataset'
import { captureReady, captureSnapshot } from '../lib/capture'
import type { InspectorSnapshot } from '../types'

export function InspectorLive({
  onCaptured,
  onBusyChange,
  full,
  blocked,
}: {
  onCaptured: (snapshot: InspectorSnapshot) => void
  onBusyChange: (busy: boolean) => void
  full: boolean
  blocked: boolean
}) {
  const camera = useCamera()
  const analysis = useFaceLandmarker(camera.videoRef, camera.status === 'live', 10, 2)
  const classifier = useClassifierModel()
  const [label, setLabel] = useState<ExpressionLabel>('neutral')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const ready =
    camera.status === 'live' && analysis.status === 'ready' && captureReady(analysis.snapshot)
  const capture = async () => {
    if (!ready || busy || full || blocked) return
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      const snapshot = await captureSnapshot(
        analysis.snapshot,
        label,
        description,
        classifier.model,
      )
      if (mounted.current) onCaptured(snapshot)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Capture failed.')
    } finally {
      if (mounted.current) {
        setBusy(false)
        onBusyChange(false)
      }
    }
  }
  return (
    <>
      <fieldset className="inspector-model-controls" disabled={busy}>
        <legend className="sr-only">Optional neural classifier</legend>
        <ModelLoader {...classifier} onLoad={classifier.load} onUnload={classifier.unload} />
      </fieldset>
      {(camera.error || analysis.error || error) && (
        <div className="error-banner" role="alert">
          {camera.error || analysis.error || error}
          {analysis.error && <button onClick={analysis.retry}>Retry MediaPipe model</button>}
        </div>
      )}
      <div className="inspector-live-grid">
        <div>
          <CameraPreview
            videoRef={camera.videoRef}
            status={camera.status}
            faceDetected={analysis.snapshot.faceDetected}
            faceCount={analysis.snapshot.faceCount}
            onStart={() => {
              analysis.load()
              void camera.start()
            }}
            onStop={camera.stop}
            paused={analysis.videoDiagnostics?.paused ?? false}
            onResume={() => {
              void camera.resume()
            }}
          />
          <section className="panel inspector-capture" aria-label="Snapshot capture">
            <h2>Capture a diagnostic snapshot</h2>
            <label>
              Intended expression
              <select
                value={label}
                disabled={busy}
                onChange={(e) => setLabel(e.target.value as ExpressionLabel)}
              >
                {expressionLabels.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Description (optional)
              <textarea
                maxLength={2000}
                value={description}
                disabled={busy}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="For example: clenched teeth, furrowed brows"
              />
            </label>
            <button
              className="button primary"
              disabled={!ready || busy || full || blocked || classifier.status === 'loading'}
              onClick={() => {
                void capture()
              }}
            >
              {busy ? 'Computing snapshot predictions…' : 'Capture snapshot'}
            </button>
            <p role="status">
              {full
                ? 'Snapshot limit reached. Export and clear before continuing.'
                : busy
                  ? 'Freezing one vector; no image is stored.'
                  : analysis.snapshot.faceCount > 1
                    ? 'Multiple faces detected. Keep exactly one face in view.'
                    : !ready
                      ? 'Waiting for one face with fresh, complete coefficients.'
                      : 'Ready: 52 coefficients from one face.'}
            </p>
            <p>
              The label records your intention, not verified ground truth. Neural predictions use
              the raw captured vector without temporal smoothing.{' '}
              {classifier.model ? '' : 'Neural prediction unavailable: no model loaded.'}
            </p>
          </section>
        </div>
        <BlendshapeInspector
          blendshapes={ready ? analysis.snapshot.blendshapes : []}
          faceDetected={analysis.snapshot.faceDetected}
          showGroups
        />
      </div>
    </>
  )
}
