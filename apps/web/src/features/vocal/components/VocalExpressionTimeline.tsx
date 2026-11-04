import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SessionVocal } from '../types'
import { findVocalModel, vocalModels } from '../models'
import { ACTIVE_SER_MODEL } from '../config'
import { activeWindow } from '../lib/core'
import { subscribeVideoClock } from '../../timeline/lib/videoClock'
import { formatTimestamp } from '../../timeline/lib/timeline'
import { formatTime } from '../../analysis/lib/format'
import '../../timeline/timeline.css'
import './vocal.css'
const unclassified: Record<string, { name: string; color: string }> = {
  silent: { name: 'Unclassified · silence gate', color: '#dfe3e5' },
  'too-short': { name: 'Unclassified · too short', color: '#e6dec8' },
  failed: { name: 'Unclassified · failed', color: '#b7b4b4' },
}
export function VocalExpressionTimeline({
  vocal,
  durationMs,
  videoRef,
  videoConnected,
}: {
  vocal?: SessionVocal
  durationMs: number
  videoRef: RefObject<HTMLVideoElement | null>
  videoConnected: boolean
}) {
  // Resolve historical presentation from saved provenance, never the active product setting.
  const recordedModel = findVocalModel(vocal?.metadata)
  const modelName =
    recordedModel?.name ??
    (!vocal?.metadata ? vocalModels[ACTIVE_SER_MODEL].name : vocal.metadata.modelId)
  const presentation: Record<string, { name: string; color: string }> = {
    ...recordedModel?.presentation,
    ...unclassified,
  }
  const sampleLabels =
    vocal?.metadata?.labels ??
    Object.keys(vocal?.samples.find((s) => s.predictedLabel)?.scores ?? {})
  const names = (label: string) => presentation[label]?.name ?? label
  const samples = vocal?.samples
  const [active, setActive] = useState(-1),
    [inspect, setInspect] = useState<number | null>(null),
    [error, setError] = useState('')
  const playhead = useRef<HTMLDivElement>(null),
    slider = useRef<HTMLInputElement>(null)
  const update = useCallback(
    (time: number) => {
      setActive(samples ? activeWindow(samples, time) : -1)
      if (playhead.current)
        playhead.current.style.left = `${Math.min(100, Math.max(0, (time / durationMs) * 100))}%`
      if (slider.current) slider.current.value = String(time)
    },
    [samples, durationMs],
  )
  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoConnected) {
      setActive(-1)
      return
    }
    return subscribeVideoClock(video, update)
  }, [videoRef, videoConnected, update])
  const paths = useMemo(() => {
    const paths = new Map<string, string[]>()
    for (const sample of samples ?? []) {
      const category = sample.predictedLabel ?? sample.status
      const start = (sample.startMs / durationMs) * 1000,
        end = (sample.endMs / durationMs) * 1000
      const commands = paths.get(category) ?? []
      commands.push(`M${start} 0H${end}V48H${start}Z`)
      paths.set(category, commands)
    }
    return [...paths].map(([category, d]) => ({ category, d: d.join('') }))
  }, [samples, durationMs])
  const index = inspect === null ? active : samples ? activeWindow(samples, inspect) : -1
  const sample = samples?.[index]
  const activeSample = videoConnected ? samples?.[active] : undefined
  function seek(time: number) {
    try {
      if (videoConnected && videoRef.current) {
        videoRef.current.currentTime = time / 1000
        update(videoRef.current.currentTime * 1000)
      }
      setInspect(time)
      setError('')
    } catch {
      setError('Could not seek the video. Reconnect readable media and try again.')
    }
  }
  return (
    <section className="expression-timeline vocal-timeline" aria-label="Vocal expression timeline">
      <div className="analysis-section-heading">
        <h2>Vocal expression timeline</h2>
        <span>{vocal?.status ?? 'not-requested'}</span>
      </div>
      {vocal?.error && (
        <p role="alert" className="analysis-error">
          {vocal.error}
        </p>
      )}
      {!samples?.length ? (
        <p>
          {vocal?.status === 'not-requested' || !vocal
            ? 'Vocal analysis has not been requested.'
            : 'No vocal predictions are available.'}
        </p>
      ) : (
        <>
          <div className="timeline-interactive" onPointerLeave={() => setInspect(null)}>
            <div className="timeline-track">
              <div className="timeline-plot">
                <svg
                  className="timeline-overview"
                  viewBox="0 0 1000 48"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Vocal intervals colored by model category; gray gaps have not been analyzed."
                >
                  <path d="M0 0H1000V48H0Z" fill="#eceeeb" />
                  {paths.map((p) => (
                    <path
                      key={p.category}
                      d={p.d}
                      fill={presentation[p.category]?.color ?? '#eceeeb'}
                    />
                  ))}
                  {activeSample && (
                    <rect
                      data-testid="active-vocal-interval"
                      x={(activeSample.startMs / durationMs) * 1000}
                      y={3}
                      width={((activeSample.endMs - activeSample.startMs) / durationMs) * 1000}
                      height={42}
                      fill="none"
                      stroke="#243c2b"
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
                {videoConnected && (
                  <div className="timeline-playhead" ref={playhead} aria-hidden="true" />
                )}
              </div>
              <input
                ref={slider}
                className="timeline-seek"
                type="range"
                min={0}
                max={durationMs}
                step={1}
                defaultValue={0}
                aria-label={
                  videoConnected ? 'Seek video by vocal timeline' : 'Explore vocal timeline'
                }
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  if (r.width > 20)
                    setInspect(
                      Math.min(
                        durationMs,
                        Math.max(0, ((e.clientX - r.left - 10) / (r.width - 20)) * durationMs),
                      ),
                    )
                }}
                onFocus={() =>
                  setInspect(
                    videoRef.current?.currentTime ? videoRef.current.currentTime * 1000 : 0,
                  )
                }
                onBlur={() => setInspect(null)}
                onChange={(e) => seek(e.target.valueAsNumber)}
              />
            </div>
          </div>
          <div className="timeline-time-markers" aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f}>{formatTime(durationMs * f)}</span>
            ))}
          </div>
          <ul className="timeline-legend" aria-label="Vocal categories">
            {[...sampleLabels, ...Object.keys(unclassified)].map((label) => (
              <li key={label}>
                <span
                  className="timeline-color-key"
                  style={{ backgroundColor: presentation[label]?.color ?? '#eceeeb' }}
                />
                {names(label)}
              </li>
            ))}
          </ul>
          <p className="analysis-small">
            Click, touch or use arrow keys to inspect and seek. Outline follows playback. Gaps and
            unclassified windows are not neutral predictions.
          </p>
          <div
            className={`vocal-inspector ${videoConnected && index === active && active >= 0 ? 'vocal-interval-active' : ''}`}
            aria-label="Vocal window details"
          >
            {sample ? (
              <>
                <strong>
                  {names(sample.predictedLabel ?? sample.status)}
                  {sample.predictedLabel ? ` (${sample.predictedLabel})` : ''}
                </strong>
                <p>
                  {formatTimestamp(sample.startMs)} – {formatTimestamp(sample.endMs)}
                </p>
                <button
                  className="product-button secondary"
                  disabled={!videoConnected}
                  onClick={() => seek(sample.startMs)}
                >
                  Seek to vocal window start
                </button>
                {sample.error && <p role="alert">{sample.error}</p>}
                {sample.predictedLabel && (
                  <dl className="vocal-product-scores">
                    {sampleLabels.map((label) => (
                      <div key={label}>
                        <dt>
                          {names(label)} ({label})
                        </dt>
                        <dd>
                          {(sample.scores[label] * 100).toFixed(2)}%{' '}
                          <progress
                            max={1}
                            value={sample.scores[label]}
                            aria-label={`${label} vocal score`}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : (
              <p>No vocal window at this timestamp.</p>
            )}
          </div>
          {vocal?.metadata && (
            <p className="analysis-small">
              {vocal.metadata.modelId} · {vocal.metadata.dtype} · {vocal.metadata.windowSeconds} s
              windows, no overlap · {samples.length} windows · revision {vocal.metadata.revision}
            </p>
          )}
        </>
      )}
      <p className="analysis-small">
        Experimental acoustic categories from {modelName}. Scores are uncalibrated model outputs,
        not a person's actual emotional state. Selection is provisional; Spanish and natural
        interview accuracy are unvalidated.
      </p>
      {error && (
        <p role="alert" className="analysis-error">
          {error}
        </p>
      )}
    </section>
  )
}
