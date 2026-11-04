import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRecording } from '../hooks/useRecording'
import type { RecordedVideo } from '../lib/recorder'
import { downloadRecording, RECORDING_LIMIT_MS, recordingExtension } from '../lib/formats'
import { formatTime } from '../../analysis/lib/format'
import { resolveVideoMetadata } from '../../analysis/lib/videoSource'
import '../recording.css'

export function RecordingPanel({
  initial,
  onClose,
  onAnalyze,
  analysisControls,
}: {
  analysisControls?: ReactNode
  initial: RecordedVideo | null
  onClose: (recording: RecordedVideo | null) => void
  onAnalyze: (recording: RecordedVideo) => void
}) {
  const recording = useRecording(initial)
  const video = useRef<HTMLVideoElement>(null)
  const playback = useRef<HTMLVideoElement>(null)
  const metadataProbe = useRef<AbortController | null>(null)
  const previewUrl = recording.previewUrl
  useEffect(() => {
    const element = playback.current
    return () => {
      metadataProbe.current?.abort()
      element?.pause()
      element?.removeAttribute('src')
      element?.load()
    }
  }, [previewUrl])
  const [playError, setPlayError] = useState<string | null>(null)
  useEffect(() => {
    const element = video.current
    if (!element) return
    element.srcObject = recording.stream
    let current = true
    if (recording.stream)
      void element.play().catch(() => {
        if (current) setPlayError('Tap Resume camera preview to start the muted preview.')
      })
    return () => {
      current = false
      element.pause()
      element.srcObject = null
    }
  }, [recording.stream])
  const live = recording.status === 'recording' || recording.status === 'ready'
  return (
    <section className="analysis-card recording-panel" aria-labelledby="recording-title">
      <div className="analysis-section-heading">
        <h2 id="recording-title">Record your interview</h2>
        <span className="local-processing-badge">LOCAL CAMERA + MICROPHONE</span>
      </div>
      <p>
        Record first, then analyze. Camera and microphone are used only on your device; no inference
        or uploads happen while recording.
      </p>
      <p className="analysis-small">
        Limit: {RECORDING_LIMIT_MS / 60_000} minutes. Recordings use browser memory. Download the
        video before leaving if you want to keep it.
      </p>
      {recording.status !== 'preview' && (
        <video
          className="recording-live"
          ref={video}
          muted
          playsInline
          aria-label="Live camera preview"
        />
      )}
      {recording.status === 'preview' && recording.previewUrl && (
        <video
          className="video-preview"
          ref={playback}
          src={recording.previewUrl}
          controls
          playsInline
          preload="metadata"
          aria-label="Recorded video preview"
          onError={() =>
            setPlayError(
              'Your browser could not preview this recording. Download it to keep it, or retake using a supported browser.',
            )
          }
          onLoadedMetadata={(event) => {
            if (event.currentTarget.duration !== Infinity) return
            metadataProbe.current?.abort()
            const controller = new AbortController()
            metadataProbe.current = controller
            void resolveVideoMetadata(event.currentTarget, controller.signal).catch(() => {
              if (!controller.signal.aborted)
                setPlayError(
                  'Video duration could not be read. Download the recording to preserve it; codec support varies by browser.',
                )
            })
          }}
        />
      )}
      <p
        role="status"
        className={recording.status === 'recording' ? 'recording-indicator' : undefined}
      >
        {recording.status === 'idle'
          ? 'Camera and microphone are off. Enable them when ready.'
          : recording.status === 'requesting-permission'
            ? 'Waiting for camera and microphone permission…'
            : recording.status === 'ready'
              ? 'Camera and microphone ready.'
              : recording.status === 'recording'
                ? '● Recording video and audio'
                : recording.status === 'stopping'
                  ? 'Finishing the recording and collecting final data…'
                  : recording.status === 'preview'
                    ? 'Recording saved in memory. Review it before analyzing.'
                    : 'Recording unavailable.'}
      </p>
      {['recording', 'stopping', 'preview'].includes(recording.status) && (
        <p className="recording-time">
          {formatTime(recording.elapsedMs)} / {formatTime(RECORDING_LIMIT_MS)}
        </p>
      )}
      {(recording.error || playError) && (
        <p className="analysis-error" role="alert">
          {recording.error || playError}
        </p>
      )}
      {recording.notice && <p className="recording-notice">{recording.notice}</p>}
      {playError && live && (
        <button
          className="product-button secondary"
          onClick={() => {
            void video.current
              ?.play()
              .then(() => setPlayError(null))
              .catch(() => setPlayError('Preview could not play. Check device/browser settings.'))
          }}
        >
          Resume camera preview
        </button>
      )}
      {recording.status === 'preview' && (
        <p className="analysis-small">
          Back keeps this recording in memory. Retake replaces it; download first if you want to
          keep a copy.
        </p>
      )}
      {recording.status === 'preview' && analysisControls}
      <div className="analysis-actions">
        {['idle', 'error'].includes(recording.status) && (
          <button
            className="product-button"
            onClick={() => {
              setPlayError(null)
              void recording.prepare()
            }}
          >
            Enable camera &amp; microphone
          </button>
        )}
        {recording.status === 'ready' && (
          <button className="product-button" onClick={recording.start}>
            Start Recording
          </button>
        )}
        {recording.status === 'recording' && (
          <button className="product-button" onClick={() => recording.stop()}>
            Stop Recording
          </button>
        )}
        {recording.recording && recording.status === 'preview' && (
          <>
            <button
              className="product-button"
              disabled={recordingExtension(recording.recording.file.type) === 'bin'}
              onClick={() => onAnalyze(recording.recording!)}
            >
              Analyze Recording
            </button>
            <button
              className="product-button secondary"
              onClick={() => {
                try {
                  downloadRecording(recording.recording!.file)
                } catch {
                  setPlayError('Could not download the video. Try again before leaving.')
                }
              }}
            >
              Download Video
            </button>
            <button
              className="product-button secondary"
              onClick={() => {
                setPlayError(null)
                void recording.prepare()
              }}
            >
              Retake Recording
            </button>
          </>
        )}
        <button
          className="product-button secondary"
          onClick={() => {
            const saved = recording.recording
            recording.cancel()
            onClose(saved)
          }}
        >
          {['recording', 'stopping'].includes(recording.status) ? 'Cancel recording' : 'Back'}
        </button>
      </div>
      {recording.recording && recordingExtension(recording.recording.file.type) === 'bin' && (
        <p>
          Unknown recording format. Download the captured bytes; use a browser supporting MP4 or
          WebM for analysis.
        </p>
      )}
    </section>
  )
}
