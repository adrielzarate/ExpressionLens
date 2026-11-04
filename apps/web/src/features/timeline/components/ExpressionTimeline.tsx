import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { AnalysisSession } from '../../analysis/types'
import { formatTime } from '../../analysis/lib/format'
import {
  buildTimeline,
  eventNeighbors,
  findSampleIndex,
  formatTimestamp,
  sampleCategory,
} from '../lib/timeline'
import { categoryPresentation } from '../lib/presentation'
import { subscribeVideoClock } from '../lib/videoClock'
import { TimelineOverview } from './TimelineOverview'
import { PredictionDetails } from './PredictionDetails'
import '../timeline.css'

interface Selection {
  index: number | null
  previous: number | null
  next: number | null
}
export function ExpressionTimeline({
  session,
  videoRef,
  videoConnected = true,
}: {
  session: AnalysisSession
  videoRef: RefObject<HTMLVideoElement | null>
  videoConnected?: boolean
}) {
  const timeline = useMemo(() => buildTimeline(session), [session])
  const [selection, setSelection] = useState<Selection>({ index: null, previous: null, next: null })
  const [tooltip, setTooltip] = useState<{
    timeMs: number
    percent: number
    below: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playhead = useRef<HTMLDivElement>(null)
  const slider = useRef<HTMLInputElement>(null)
  const position = useRef<HTMLOutputElement>(null)
  const reviewTime = useRef(0)
  const selectionRef = useRef<Selection | null>(null)
  const update = useCallback(
    (timeMs: number) => {
      const time = Math.min(timeline.durationMs, Math.max(0, timeMs))
      reviewTime.current = time
      const index = findSampleIndex(timeline, time)
      const neighbors = eventNeighbors(timeline.events, time)
      const nextSelection = { index, ...neighbors }
      if (playhead.current) playhead.current.style.left = `${(time / timeline.durationMs) * 100}%`
      if (slider.current) slider.current.value = String(time)
      if (position.current) position.current.textContent = formatTimestamp(time)
      const sample = index === null ? null : timeline.samples[index]
      if (slider.current)
        slider.current.setAttribute(
          'aria-valuetext',
          `${formatTimestamp(time)}; ${categoryPresentation[sample ? sampleCategory(sample) : 'not-analyzed'].label}${sample ? `; observation sampled at ${formatTimestamp(sample.timestampMs)}` : ''}`,
        )
      const old = selectionRef.current
      if (
        !old ||
        old.index !== index ||
        old.previous !== neighbors.previous ||
        old.next !== neighbors.next
      ) {
        selectionRef.current = nextSelection
        setSelection(nextSelection)
      }
    },
    [timeline],
  )
  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      update(reviewTime.current)
      return
    }
    return subscribeVideoClock(video, update)
  }, [videoRef, update])
  const showTooltip = (timeMs: number) => {
    if (!Number.isFinite(timeMs)) return
    const time = Math.max(0, Math.min(timeline.durationMs, timeMs))
    const rect = slider.current?.getBoundingClientRect()
    const below = !!rect && rect.top < 300 && window.innerHeight - rect.bottom > rect.top
    setTooltip({ timeMs: time, percent: (time / timeline.durationMs) * 100, below })
  }
  const seek = (timeMs: number) => {
    const video = videoRef.current
    if (!video) {
      const time = Math.max(0, Math.min(session.durationMs, timeMs))
      update(time)
      showTooltip(time)
      setError(null)
      return
    }
    try {
      video.currentTime = Math.max(0, Math.min(session.durationMs, timeMs)) / 1000
      update(video.currentTime * 1000)
      showTooltip(video.currentTime * 1000)
      setError(null)
    } catch {
      setError('Could not seek this video. Wait for readable video data or select the file again.')
    }
  }
  const tooltipIndex = tooltip ? findSampleIndex(timeline, tooltip.timeMs) : null
  const sample = tooltipIndex === null ? null : timeline.samples[tooltipIndex]
  return (
    <section className="expression-timeline" aria-labelledby="timeline-title">
      <div className="analysis-section-heading">
        <h2 id="timeline-title">Expression timeline</h2>
        <span>
          {videoConnected ? 'Video position' : 'Review position'}{' '}
          <output
            ref={position}
            aria-label={videoConnected ? 'Current video position' : 'Current review position'}
            aria-live="off"
          >
            00:00.000
          </output>
        </span>
      </div>
      <div className="timeline-interactive" onPointerLeave={() => setTooltip(null)}>
        <div className="timeline-track">
          <div className="timeline-plot">
            <TimelineOverview timeline={timeline} />
            <div className="timeline-playhead" ref={playhead} aria-hidden="true" />
          </div>
          <input
            ref={slider}
            className="timeline-seek"
            type="range"
            min={0}
            max={session.durationMs}
            step={1}
            defaultValue={0}
            aria-label={
              videoConnected
                ? 'Seek video by expression timeline'
                : 'Explore session by expression timeline'
            }
            aria-describedby={tooltip ? 'timeline-policy timeline-tooltip' : 'timeline-policy'}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              const width = rect.width - 20
              if (width > 0)
                showTooltip(((event.clientX - rect.left - 10) / width) * timeline.durationMs)
            }}
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              if (rect.width > 20)
                showTooltip(
                  ((event.clientX - rect.left - 10) / (rect.width - 20)) * timeline.durationMs,
                )
            }}
            onFocus={() =>
              showTooltip(
                videoRef.current ? videoRef.current.currentTime * 1000 : reviewTime.current,
              )
            }
            onBlur={() => setTooltip(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTooltip(null)
                event.stopPropagation()
              }
            }}
            onChange={(event) => seek(event.target.valueAsNumber)}
          />
        </div>
        {tooltip && (
          <div
            id="timeline-tooltip"
            role="tooltip"
            className={`timeline-tooltip ${tooltip.below ? 'timeline-tooltip-below' : ''}`}
            style={{
              left: `clamp(0px, calc(${tooltip.percent}% - 150px), max(0px, calc(100% - 300px)))`,
            }}
          >
            <PredictionDetails sample={sample} timestampMs={tooltip.timeMs} />
          </div>
        )}
      </div>
      <div className="timeline-time-markers" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <span key={fraction}>{formatTime(session.durationMs * fraction)}</span>
        ))}
      </div>
      <ul className="timeline-legend" aria-label="Expression timeline legend">
        {Object.entries(categoryPresentation).map(([category, theme]) => (
          <li key={category}>
            <span
              className="timeline-color-key"
              style={{ backgroundColor: theme.color }}
              aria-hidden="true"
            />
            {theme.label}
          </li>
        ))}
      </ul>
      <p className="analysis-small" id="timeline-policy">
        Hover for expression details. Click or drag to seek; use arrow keys when focused. On mobile,
        touch the timeline to inspect. Predictions are sampled observations.
      </p>
      <div className="analysis-actions">
        <button
          className="product-button secondary"
          disabled={selection.previous === null}
          onClick={() => {
            if (selection.previous !== null) seek(selection.previous)
          }}
        >
          Previous event
        </button>
        <button
          className="product-button secondary"
          disabled={selection.next === null}
          onClick={() => {
            if (selection.next !== null) seek(selection.next)
          }}
        >
          Next event
        </button>
      </div>
      {error && (
        <p className="analysis-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
