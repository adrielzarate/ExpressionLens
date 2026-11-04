import { hasAnalysisIssues } from '../lib/sessionStatus'
import { useMemo } from 'react'
import type { AnalysisSession } from '../types'
import { sessionStatistics } from '../lib/statistics'
import { formatTime } from '../lib/format'

export function AnalysisSummary({ session }: { session: AnalysisSession }) {
  const stats = useMemo(() => sessionStatistics(session), [session])
  return (
    <section className="analysis-card analysis-results" aria-labelledby="results-title">
      <div className="analysis-section-heading">
        <h2 id="results-title">Your analysis summary</h2>
        <span className="product-status">
          {hasAnalysisIssues(session) ? 'RESULTS WITH ERRORS' : 'AVAILABLE RESULTS'}
        </span>
      </div>
      <dl className="video-metadata">
        <div>
          <dt>Video duration</dt>
          <dd>{formatTime(session.durationMs)}</dd>
        </div>
        <div>
          <dt>Frames sampled</dt>
          <dd>{stats.total}</dd>
        </div>
        <div>
          <dt>One face detected</dt>
          <dd>{stats.detected}</dd>
        </div>
        <div>
          <dt>No face detected</dt>
          <dd>{stats.noFace}</dd>
        </div>
        <div>
          <dt>Multiple faces skipped</dt>
          <dd>{stats.multipleFaces}</dd>
        </div>
        <div>
          <dt>Face coverage</dt>
          <dd>{stats.coverage === null ? '—' : `${(stats.coverage * 100).toFixed(1)}%`}</dd>
        </div>
      </dl>
      <p>
        Face coverage uses all {stats.total} sampled frames. Expression percentages below use only
        the {stats.detected} frames with one classified face, including uncertain results.
      </p>
      <div className="expression-distribution">
        {stats.distribution.map((row) => (
          <div key={row.label}>
            <div>
              <span>{row.label === 'uncertain' ? '❔ Uncertain' : row.label}</span>
              <strong>
                {row.count}{' '}
                <span>· {row.fraction === null ? '—' : `${(row.fraction * 100).toFixed(1)}%`}</span>
              </strong>
            </div>
            <progress
              aria-label={`${row.label} share of detected frames`}
              max={1}
              value={row.fraction ?? 0}
            />
          </div>
        ))}
      </div>
      {!stats.detected && (
        <p>
          No frames with a single readable face were classified. No-face frames are not neutral or
          uncertain predictions.
        </p>
      )}
      <p className="analysis-small">
        Sampled at {session.samplingFps} FPS · Model {session.modelVersion}. Frame counts are
        observations, not exact durations. Visible-expression categories do not establish a person's
        actual emotional state or interview suitability. Synthetic model evaluation does not
        establish real-world performance.
      </p>
    </section>
  )
}
