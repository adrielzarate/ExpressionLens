import { inferenceDelegate } from '../lib/mediapipe'
import type { CameraStatus, FaceSnapshot, ModelStatus, VideoDiagnostics } from '../types/face'

export function DiagnosticsPanel({
  cameraStatus,
  modelStatus,
  snapshot,
  videoDiagnostics,
  targetFps,
  onFpsChange,
}: {
  cameraStatus: CameraStatus
  modelStatus: ModelStatus
  videoDiagnostics: VideoDiagnostics | null
  snapshot: FaceSnapshot
  targetFps: number
  onFpsChange: (value: number) => void
}) {
  return (
    <section className="panel diagnostics" aria-labelledby="diagnostics-heading">
      <div className="panel-heading">
        <h2 id="diagnostics-heading">
          <span className="section-number">04</span> Diagnostics
        </h2>
        <span className="diagnostic-symbol" aria-hidden="true">
          ⌁
        </span>
      </div>
      <dl className="diagnostic-grid">
        <div>
          <dt>Camera</dt>
          <dd>
            <i className={`status-dot ${cameraStatus === 'live' ? 'green' : ''}`} />
            {cameraStatus}
          </dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>
            <i className={`status-dot ${modelStatus === 'ready' ? 'green' : ''}`} />
            {modelStatus}
          </dd>
        </div>
        <div>
          <dt>Face detected</dt>
          <dd>{snapshot.faceDetected === null ? '—' : snapshot.faceDetected ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Inference rate</dt>
          <dd>
            {snapshot.fps.toFixed(1)} <small>FPS</small>
          </dd>
        </div>
        <div>
          <dt>Avg. inference</dt>
          <dd>
            {snapshot.averageDurationMs.toFixed(1)} <small>ms</small>
          </dd>
        </div>
        <div>
          <dt>Coefficients</dt>
          <dd>
            {snapshot.blendshapes.length} <small>/ 52</small>
          </dd>
        </div>
        <div>
          <dt>Delegate</dt>
          <dd>{modelStatus === 'ready' ? inferenceDelegate : '—'}</dd>
        </div>
        <div>
          <dt>
            <label htmlFor="target-fps">Target rate</label>
          </dt>
          <dd>
            <select
              id="target-fps"
              value={targetFps}
              onChange={(event) => onFpsChange(Number(event.target.value))}
            >
              {[5, 10, 15, 20].map((fps) => (
                <option key={fps} value={fps}>
                  {fps} FPS
                </option>
              ))}
            </select>
          </dd>
        </div>
        <div>
          <dt>Frame scheduler</dt>
          <dd>
            {videoDiagnostics?.scheduler === 'video-frame'
              ? 'Video frames'
              : videoDiagnostics?.scheduler === 'animation-frame'
                ? 'Fallback'
                : 'Waiting'}
          </dd>
        </div>
      </dl>
      {videoDiagnostics && (
        <div className="video-debug">
          <p>
            <strong>Video pipeline:</strong> {videoDiagnostics.blockedBy}
          </p>
          <p>
            {videoDiagnostics.width} × {videoDiagnostics.height} · readyState{' '}
            {videoDiagnostics.readyState} · {videoDiagnostics.paused ? 'paused' : 'playing'} · time{' '}
            {videoDiagnostics.currentTime.toFixed(2)} s
          </p>
          <p>
            Frame callbacks: {videoDiagnostics.callbacks} · Completed inferences:{' '}
            {videoDiagnostics.inferences}
          </p>
        </div>
      )}
    </section>
  )
}
