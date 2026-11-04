import { useMemo } from 'react'
import { datasetStatistics } from '../lib/datasetStatistics'
import type { FacialExpressionSample } from '../types/dataset'

export function DatasetOverview({ samples }: { samples: FacialExpressionSample[] }) {
  const stats = useMemo(() => datasetStatistics(samples), [samples])
  return (
    <section className="panel dataset-overview" aria-labelledby="overview-title">
      <div className="panel-heading">
        <h2 id="overview-title">Dataset overview</h2>
        <span className="badge">SCHEMA V1 · 52 FEATURES</span>
      </div>
      <dl className="dataset-totals">
        {[
          ['Samples', stats.total],
          ['Participants', stats.participants],
          ['Sessions', stats.sessions],
          ['Synthetic', stats.synthetic],
          ['Real', stats.real],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="class-counts">
        {stats.classes.map((row) => (
          <div key={row.label}>
            <strong>{row.label}</strong>
            <span>{row.samples} samples</span>
            <small>{row.participants} participants</small>
          </div>
        ))}
      </div>
      <div className="quality-notes">
        <p>
          Preserve the same anonymous participant ID across expressions. Future evaluation must
          split by participant; consecutive frames are correlated samples of one person.
        </p>
        {stats.warnings.length > 0 && (
          <details>
            <summary>Data quality notes ({stats.warnings.length})</summary>
            <ul>
              {stats.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <p>These are collection reminders, not a guarantee of training quality.</p>
          </details>
        )}
      </div>
    </section>
  )
}
