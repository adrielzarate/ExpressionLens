import type { ExpressionSample } from '../../analysis/types'
import { categoryPresentation } from '../lib/presentation'
import { formatTimestamp, sampleCategory } from '../lib/timeline'

export function PredictionDetails({
  sample,
  timestampMs,
}: {
  sample: ExpressionSample | null
  timestampMs: number
}) {
  const theme = categoryPresentation[sample ? sampleCategory(sample) : 'not-analyzed']
  return (
    <section className="prediction-details" aria-labelledby="prediction-title">
      <div className="tooltip-heading">
        <h3 id="prediction-title">{theme.label}</h3>
        <span>{formatTimestamp(timestampMs)}</span>
      </div>
      {sample ? (
        <p className="tooltip-sample-time">
          Sample: <strong>{formatTimestamp(sample.timestampMs)}</strong>
        </p>
      ) : (
        <p>No stored observation at this position.</p>
      )}
      {sample?.status === 'detected' ? (
        <>
          <p className="tooltip-raw">
            Model's top match: <strong>{categoryPresentation[sample.rawLabel].label}</strong> ·{' '}
            {(sample.confidence * 100).toFixed(1)}%
          </p>
          <div className="expression-distribution">
            {sample.distribution.map((entry) => (
              <div key={entry.label}>
                <div>
                  <span>{categoryPresentation[entry.label].label}</span>
                  <strong>{(entry.probability * 100).toFixed(1)}%</strong>
                </div>
                <progress
                  aria-label={`${entry.label} stored probability`}
                  max={1}
                  value={entry.probability}
                />
              </div>
            ))}
          </div>
          <p className="tooltip-note">
            Top-two difference: {(sample.margin * 100).toFixed(1)} percentage points. Model scores
            are not calibrated certainty.
          </p>
        </>
      ) : (
        sample && (
          <p>
            {sample.status === 'no-face'
              ? 'No face detected in this sample.'
              : 'Multiple faces detected; sample skipped.'}{' '}
            No expression scores available.
          </p>
        )
      )}
    </section>
  )
}
