import { evaluateExpression, defaultThresholds } from '../lib/expressionRules'
import type { ExpressionThresholds } from '../lib/expressionRules'
import { HeuristicDebug } from './HeuristicDebug'
import type { Blendshape, CameraStatus, ModelStatus } from '../types/face'

export function ExpressionPreview({
  blendshapes,
  faceDetected,
  cameraStatus,
  modelStatus,
  faceCount = 1,
  title = 'Expression preview',
  thresholds = defaultThresholds,
  onThresholdsChange,
}: {
  blendshapes: Blendshape[]
  faceDetected: boolean | null
  cameraStatus: CameraStatus
  modelStatus: ModelStatus
  faceCount?: number
  title?: string
  thresholds?: ExpressionThresholds
  onThresholdsChange?: (thresholds: ExpressionThresholds) => void
}) {
  const available =
    cameraStatus === 'live' && modelStatus === 'ready' && faceDetected === true && faceCount === 1
  const analysis = available ? evaluateExpression(blendshapes, thresholds) : null
  const expression = analysis?.expression
  const waiting =
    cameraStatus === 'error' || modelStatus === 'error'
      ? { title: 'Analysis unavailable', detail: 'Check the error message above to resume.' }
      : cameraStatus === 'requesting'
        ? {
            title: 'Waiting for camera',
            detail: 'Allow camera access and wait for video playback.',
          }
        : cameraStatus !== 'live'
          ? { title: 'Camera is off', detail: 'Start the camera to preview facial movements.' }
          : modelStatus !== 'ready'
            ? {
                title: 'Loading facial model',
                detail: 'Local model initialization may take longer on mobile.',
              }
            : faceCount > 1
              ? {
                  title: 'Multiple faces detected',
                  detail: 'Keep only one person in frame to compare predictions.',
                }
              : faceDetected === false
                ? {
                    title: 'No face detected',
                    detail: 'Face the front camera in good light and keep your face in frame.',
                  }
                : faceDetected === true
                  ? {
                      title: 'Waiting for coefficients',
                      detail: 'A face was found, but the expression inputs are not available yet.',
                    }
                  : {
                      title: 'Waiting for video frames',
                      detail: 'The model is ready. Waiting for fresh video frames to analyze.',
                    }
  return (
    <section className="panel expression-panel" aria-labelledby="expression-heading">
      <div className="panel-heading">
        <h2 id="expression-heading">
          <span className="section-number">02</span> {title}
        </h2>
        <span className="badge badge-experimental">EXPERIMENTAL</span>
      </div>
      <div className="expression-content">
        <div className={`expression-face ${expression ? 'has-expression' : ''}`} aria-hidden="true">
          {expression?.emoji ?? '◌'}
        </div>
        <div>
          <span className="eyebrow">VISIBLE EXPRESSION</span>
          <h3>{expression?.label ?? waiting.title}</h3>
          <p>{expression ? 'Rule-based baseline · live coefficients' : waiting.detail}</p>
        </div>
      </div>
      <HeuristicDebug
        blendshapes={available ? blendshapes : []}
        analysis={analysis}
        thresholds={thresholds}
        onChange={onThresholdsChange}
      />
      <p className="expression-disclaimer">
        A preview of facial movements, not an interpretation of your emotions.
      </p>
    </section>
  )
}
