import type { RefObject } from 'react'
import type { CameraStatus } from '../types/face'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  faceDetected: boolean | null
  faceCount?: number
  startDisabled?: boolean
  onStart: () => void
  onStop: () => void
  paused: boolean
  onResume: () => void
}

export function CameraPreview({
  videoRef,
  status,
  faceDetected,
  faceCount,
  onStart,
  startDisabled = false,
  onStop,
  paused,
  onResume,
}: Props) {
  const live = status === 'live'
  const requesting = status === 'requesting'
  return (
    <section className="panel camera-panel" aria-labelledby="camera-heading">
      <div className="panel-heading">
        <h2 id="camera-heading">
          <span className="section-number">01</span> Camera feed
        </h2>
        <span className={`badge ${live ? 'badge-live' : ''}`}>
          <i />
          {live ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>
      <div className={`viewfinder ${live ? 'is-live' : ''}`}>
        <video ref={videoRef} muted playsInline aria-label="Mirrored live camera preview" />
        {!live && (
          <div className="camera-placeholder">
            <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <rect x="10" y="18" width="44" height="33" rx="9" />
              <path d="m23 18 4-7h10l4 7" />
              <circle cx="32" cy="34" r="9" />
            </svg>
            <h3>{requesting ? 'Waiting for permission' : 'Your mirror, ready when you are.'}</h3>
            <p>
              {requesting
                ? 'Allow camera access in your browser to continue.'
                : 'Start your camera to explore facial movements in real time.'}
            </p>
            <span className="private-note">◎ &nbsp; Camera access is always your choice</span>
          </div>
        )}
        <span className="viewfinder-corner top-left" />
        <span className="viewfinder-corner top-right" />
        <span className="viewfinder-corner bottom-left" />
        <span className="viewfinder-corner bottom-right" />
        {live && (
          <>
            <span className="feed-label">FRONT CAMERA · MIRRORED</span>
            <span className="face-label">
              {faceCount !== undefined && faceCount > 1
                ? 'Multiple faces detected'
                : faceDetected === true
                  ? 'Face detected'
                  : faceDetected === false
                    ? 'No face detected'
                    : 'Waiting for frames'}
            </span>
          </>
        )}
      </div>
      <div className="camera-toolbar">
        <span className="toolbar-note">
          {live ? 'Keep your face in frame' : 'Video only. No recording.'}
        </span>
        <div className="button-group">
          {live && paused ? (
            <button className="button primary" onClick={onResume}>
              ▷ Resume video
            </button>
          ) : (
            <button
              className="button primary"
              onClick={onStart}
              disabled={startDisabled || live || requesting}
            >
              <span aria-hidden="true">▷</span> Start Camera
            </button>
          )}
          <button className="button secondary" onClick={onStop} disabled={!live && !requesting}>
            <span aria-hidden="true">□</span> Stop
          </button>
        </div>
      </div>
    </section>
  )
}
