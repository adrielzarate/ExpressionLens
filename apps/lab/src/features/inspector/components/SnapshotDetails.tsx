import { memo, useState } from 'react'
import { featureNames } from '../../dataset/lib/featureSchema'
import type { InspectorSnapshot } from '../types'

// Keep 52 coefficient rows out of the DOM until the user opens a capture.
export const SnapshotDetails = memo(function SnapshotDetails({ row }: { row: InspectorSnapshot }) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Snapshot coefficients and model identification</summary>
      {open && (
        <>
          <p>
            MediaPipe: {row.modelInfo.name} / {row.modelInfo.version} · SHA-256{' '}
            {row.modelInfo.sha256}
          </p>
          <p>Rule thresholds: {JSON.stringify(row.rule.thresholds)}</p>
          <dl className="snapshot-values">
            {row.features.map((value, i) => (
              <div key={featureNames[i]}>
                <dt>{featureNames[i]}</dt>
                <dd>{value.toFixed(5)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </details>
  )
})
