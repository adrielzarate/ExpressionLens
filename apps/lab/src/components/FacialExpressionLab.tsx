import { useState } from 'react'
import { evaluateExpression, defaultThresholds } from '../lib/expressionRules'
import type { ExpressionThresholds } from '../lib/expressionRules'
import { CameraPreview } from './CameraPreview'
import { ExpressionPreview } from './ExpressionPreview'
import { BlendshapeInspector } from './BlendshapeInspector'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { useCamera } from '../hooks/useCamera'
import { useFaceLandmarker } from '../hooks/useFaceLandmarker'
import { useClassifierModel } from '../features/comparison/hooks/useClassifierModel'
import { useLiveClassifier } from '../features/comparison/hooks/useLiveClassifier'
import { ModelLoader } from '../features/comparison/components/ModelLoader'
import { NeuralPreview } from '../features/comparison/components/NeuralPreview'
import { ManualEvaluation } from '../features/comparison/components/ManualEvaluation'
import { LiveDiagnostics } from '../features/comparison/components/LiveDiagnostics'
import type { SmoothingLevel } from '../features/comparison/types/comparison'
import '../features/comparison/comparison.css'

export function FacialExpressionLab() {
  const camera = useCamera()
  const [thresholds, setThresholds] = useState<ExpressionThresholds>({ ...defaultThresholds })
  const [targetFps, setTargetFps] = useState(10)
  // One detector, configured to notice a second face so ambiguous frames can be rejected.
  const analysis = useFaceLandmarker(camera.videoRef, camera.status === 'live', targetFps, 2)
  const classifier = useClassifierModel()
  const [comparison, setComparison] = useState(true)
  const [smoothing, setSmoothing] = useState<SmoothingLevel>('medium')
  const [showDiagnostics, setShowDiagnostics] = useState(true)
  const [showRaw, setShowRaw] = useState(false)
  const [manual, setManual] = useState(false)
  const neural = useLiveClassifier(
    classifier.model,
    analysis.snapshot,
    camera.status === 'live',
    comparison,
    smoothing,
  )

  const start = () => {
    analysis.load()
    void camera.start()
  }
  const { snapshot } = analysis
  const pairedFrame = comparison && neural.prediction ? neural.prediction.frame : snapshot
  // Re-score only the baseline on the completed shared frame. Changing heuristic
  // settings must not re-run the network or alter its probabilities/smoothing.
  const heuristic = neural.prediction
    ? evaluateExpression(neural.prediction.frame.blendshapes, thresholds)
    : null
  const prediction =
    neural.prediction && heuristic
      ? {
          ...neural.prediction,
          rule: heuristic.expression,
          heuristic: {
            thresholds: { ...thresholds },
            scores: heuristic.scores,
            ambiguous: heuristic.ambiguous,
          },
        }
      : null
  const neuralState = !classifier.model
    ? classifier.status === 'loading'
      ? 'Loading model…'
      : 'No model loaded'
    : camera.status !== 'live'
      ? 'Camera is off'
      : snapshot.faceCount > 1
        ? 'Multiple faces detected'
        : snapshot.faceDetected === false
          ? 'No face detected'
          : neural.error
            ? 'Inference unavailable'
            : 'Waiting for a shared frame'

  return (
    <>
      <div className="lab-page">
        <div className="page-intro">
          <div>
            <div className="eyebrow page-eyebrow">
              ExpressionLens Lab <span>/</span> MILESTONES 01 + 04
            </div>
            <h1>
              Facial Expression Lab<span>.</span>
            </h1>
            <p>A closer look at how your face moves. In real time, on your device.</p>
          </div>
          <span className="version-tag">LAB / 001</span>
        </div>
        <div className="privacy-banner">
          <span className="privacy-icon" aria-hidden="true">
            ◇
          </span>
          <p>
            <strong>Your face stays with you.</strong> Frames are processed in your browser. Nothing
            is uploaded or recorded.
          </p>
          <span className="privacy-chip">100% LOCAL</span>
        </div>
        {(camera.error || analysis.error) && (
          <div className="error-banner" role="alert">
            {camera.error && <p>{camera.error}</p>}
            {analysis.error && (
              <p>
                {analysis.error}{' '}
                <button className="text-button" onClick={analysis.retry}>
                  Retry model ↗
                </button>
              </p>
            )}
          </div>
        )}
        {analysis.status === 'loading' && (
          <p className="loading-notice" role="status">
            Loading local Face Landmarker assets… The first load may take a moment.
          </p>
        )}
        <ModelLoader
          model={classifier.model}
          status={classifier.status}
          error={classifier.error}
          onLoad={classifier.load}
          onUnload={classifier.unload}
        />
        <div className="lab-controls" role="group" aria-label="Live comparison controls">
          <label>
            <input
              type="checkbox"
              checked={comparison}
              onChange={(event) => setComparison(event.target.checked)}
            />
            Comparison mode
          </label>
          <label>
            Neural smoothing
            <select
              value={smoothing}
              disabled={!comparison}
              onChange={(event) => setSmoothing(event.target.value as SmoothingLevel)}
            >
              {(['disabled', 'low', 'medium', 'high'] as const).map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={showRaw}
              disabled={!comparison}
              onChange={(event) => setShowRaw(event.target.checked)}
            />
            Show raw prediction
          </label>
          <label>
            <input
              type="checkbox"
              checked={showDiagnostics}
              onChange={(event) => setShowDiagnostics(event.target.checked)}
            />
            Show diagnostics
          </label>
          <label>
            <input
              type="checkbox"
              checked={manual}
              onChange={(event) => setManual(event.target.checked)}
            />
            Manual evaluation
          </label>
        </div>
        <div className="lab-live-layout">
          <CameraPreview
            videoRef={camera.videoRef}
            status={camera.status}
            faceDetected={snapshot.faceDetected}
            faceCount={snapshot.faceCount}
            onStart={start}
            onStop={camera.stop}
            paused={analysis.videoDiagnostics?.paused ?? false}
            onResume={() => {
              void camera.resume()
            }}
          />
          <div className="live-predictions">
            <div className={comparison ? 'comparison-grid' : ''}>
              <ExpressionPreview
                title={comparison ? 'Rule-Based Detector' : 'Expression preview'}
                thresholds={thresholds}
                onThresholdsChange={setThresholds}
                cameraStatus={camera.status}
                modelStatus={analysis.status}
                faceCount={pairedFrame.faceCount}
                blendshapes={pairedFrame.faceCount === 1 ? pairedFrame.blendshapes : []}
                faceDetected={pairedFrame.faceDetected}
              />
              {comparison && (
                <NeuralPreview
                  prediction={prediction}
                  state={neuralState}
                  smoothing={smoothing}
                  showRaw={showRaw}
                />
              )}
            </div>
            {showDiagnostics && (
              <LiveDiagnostics
                fps={snapshot.fps}
                model={classifier.model}
                prediction={prediction}
                error={neural.error}
              />
            )}
          </div>
        </div>
        <p className="lab-disclaimer">
          Experimental visible-expression testing only. These outputs do not determine actual
          emotions, honesty, personality, or interview suitability. Synthetic test scores do not
          establish real-world performance.
        </p>
        <div hidden={!manual}>
          <ManualEvaluation prediction={manual && comparison ? prediction : null} />
        </div>
        {showDiagnostics && (
          <DiagnosticsPanel
            cameraStatus={camera.status}
            modelStatus={analysis.status}
            snapshot={snapshot}
            videoDiagnostics={analysis.videoDiagnostics}
            targetFps={targetFps}
            onFpsChange={setTargetFps}
          />
        )}
        <details className="lab-inspector">
          <summary>Inspect all 52 live blendshape coefficients</summary>
          <BlendshapeInspector
            blendshapes={snapshot.faceCount === 1 ? snapshot.blendshapes : []}
            faceDetected={snapshot.faceDetected}
          />
        </details>
        <footer>
          <span>
            <i className="status-dot green" /> Built for curiosity. Designed for privacy.
          </span>
          <span>
            MEDIAPIPE FACE LANDMARKER <span className="footer-divider">/</span> 52 BLENDSHAPES
          </span>
        </footer>
      </div>
    </>
  )
}
