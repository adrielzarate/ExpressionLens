import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { subscribeVideoClock } from '../../features/timeline/lib/videoClock'
import { formatTimestamp } from '../../features/timeline/lib/timeline'
import { activeWindow } from './core'
import type { VocalExpressionSample } from './core'
export function VocalTimeline({
  samples,
  labels,
  mediaRef,
  mediaKey,
}: {
  samples: VocalExpressionSample[]
  labels: string[]
  mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null>
  mediaKey: string
}) {
  const [active, setActive] = useState(-1)
  const [error, setError] = useState('')
  const update = useCallback((time: number) => setActive(activeWindow(samples, time)), [samples])
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    // The shared clock also supports audio elements via its animation-frame fallback.
    return subscribeVideoClock(media as HTMLVideoElement, update)
  }, [mediaRef, mediaKey, update])
  const seek = (index: number) => {
    try {
      if (mediaRef.current) {
        mediaRef.current.currentTime = samples[index].startMs / 1000
        update(mediaRef.current.currentTime * 1000)
      }
      setError('')
    } catch {
      setError('Could not seek this media. Wait for readable playback data.')
    }
  }
  return (
    <section className="vocal-result">
      <h2>Timestamped vocal expression windows</h2>
      <p>
        Click an interval to seek. Highlight follows playback; no inference runs while navigating.
      </p>
      <div className="vocal-track" aria-label="Vocal expression timeline">
        {samples.map((sample, index) => (
          <button
            key={sample.startMs}
            className={active === index ? 'vocal-active' : ''}
            style={{
              flexGrow: sample.endMs - sample.startMs,
              backgroundColor: sample.predictedLabel
                ? [
                    '#d9e9ff',
                    '#e7f0cc',
                    '#ffd9cf',
                    '#e4ddf4',
                    '#ffedc7',
                    '#c9efed',
                    '#f5d8ed',
                    '#e1dfcf',
                    '#d2e4dc',
                  ][labels.indexOf(sample.predictedLabel) % 9]
                : '#e3e5e8',
            }}
            onClick={() => seek(index)}
            aria-label={`${formatTimestamp(sample.startMs)} ${sample.predictedLabel ?? sample.status}`}
            aria-current={active === index ? 'true' : undefined}
          >
            {sample.predictedLabel ?? '—'}
          </button>
        ))}
      </div>
      <ol className="vocal-windows">
        {samples.map((sample, index) => (
          <li key={sample.startMs} className={active === index ? 'vocal-active' : ''}>
            <button
              onClick={() => seek(index)}
              aria-current={active === index ? 'true' : undefined}
            >
              {formatTimestamp(sample.startMs)} – {formatTimestamp(sample.endMs)} ·{' '}
              {sample.predictedLabel ?? `Unclassified (${sample.status})`}
            </button>
            {sample.margin !== null && (
              <p>Top-two margin: {(sample.margin * 100).toFixed(2)} percentage points</p>
            )}
            {sample.error && <p role="alert">{sample.error}</p>}
            {sample.predictedLabel && (
              <dl className="vocal-scores">
                {labels.map((label) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {(sample.scores[label] * 100).toFixed(2)}%{' '}
                      <progress
                        max={1}
                        value={sample.scores[label]}
                        aria-label={`${label} softmax score`}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
