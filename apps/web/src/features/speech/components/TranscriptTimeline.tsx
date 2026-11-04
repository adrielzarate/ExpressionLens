import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { SessionTranscription } from '../types'
import { subscribeVideoClock } from '../../timeline/lib/videoClock'
import { formatTimestamp } from '../../timeline/lib/timeline'
import './transcript.css'
export function TranscriptTimeline({
  transcription,
  videoRef,
  videoConnected,
}: {
  transcription?: SessionTranscription
  videoRef: RefObject<HTMLVideoElement | null>
  videoConnected: boolean
}) {
  const [active, setActive] = useState<number | null>(null)
  const [seekError, setSeekError] = useState('')
  const update = useCallback(
    (time: number) => {
      const index =
        transcription?.segments.findIndex((row) => row.startMs <= time && time < row.endMs) ?? -1
      setActive(index < 0 ? null : index)
    },
    [transcription],
  )
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    return subscribeVideoClock(video, update)
  }, [videoRef, videoConnected, update])
  return (
    <section className="transcript-panel" aria-label="Speech transcript">
      <div className="analysis-section-heading">
        <h2>Speech transcript</h2>
        <span>{transcription?.status ?? 'not-requested'}</span>
      </div>
      {!transcription || transcription.status === 'not-requested' ? (
        <p>Transcription has not been requested.</p>
      ) : (
        <>
          <p>
            Selected language: {transcription.selectedLanguage}. Detected language:{' '}
            {transcription.detectedLanguage ?? 'not reported by this model pipeline'}.
          </p>
          {transcription.error && (
            <p role="alert" className="analysis-error">
              {transcription.error}
            </p>
          )}
          {transcription.status === 'completed' && (
            <>
              <p className="transcript-text">
                {transcription.text ||
                  'No speech text was returned. This does not prove the video contains no speech.'}
              </p>
              {transcription.timestampWarning && (
                <p role="alert">{transcription.timestampWarning}</p>
              )}
              {!videoConnected && (
                <p>Select the original video to restore synchronized playback.</p>
              )}
              <ol className="transcript-segments">
                {transcription.segments.map((segment, index) => (
                  <li key={`${index}-${segment.startMs}`}>
                    <button
                      className={`product-button secondary ${videoConnected && active === index ? 'transcript-active' : ''}`}
                      aria-current={videoConnected && active === index ? 'true' : undefined}
                      disabled={!videoConnected}
                      onClick={() => {
                        try {
                          if (videoRef.current) {
                            videoRef.current.currentTime = segment.startMs / 1000
                            update(segment.startMs)
                          }
                          setSeekError('')
                        } catch {
                          setSeekError(
                            'Could not seek the video. Wait for readable media or reconnect it.',
                          )
                        }
                      }}
                    >
                      <small>
                        {formatTimestamp(segment.startMs)} – {formatTimestamp(segment.endMs)}
                      </small>
                      {segment.text}
                    </button>
                  </li>
                ))}
              </ol>
              {transcription.metadata && (
                <p className="analysis-small">
                  {transcription.metadata.modelId} · {transcription.metadata.backend} · Inference{' '}
                  {(transcription.metadata.inferenceMs / 1000).toFixed(2)} s · Model loading{' '}
                  {(transcription.metadata.loadMs / 1000).toFixed(2)} s
                </p>
              )}
            </>
          )}
        </>
      )}
      {seekError && <p role="alert">{seekError}</p>}
    </section>
  )
}
