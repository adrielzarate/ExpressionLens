import type { PairedPrediction, SmoothingLevel } from '../types/comparison'

export function NeuralPreview({
  prediction,
  state,
  smoothing,
  showRaw,
}: {
  prediction: PairedPrediction | null
  state: string
  smoothing: SmoothingLevel
  showRaw: boolean
}) {
  return (
    <section className="panel neural-preview" aria-labelledby="neural-preview-title">
      <div className="panel-heading">
        <h2 id="neural-preview-title">Neural Network Classifier</h2>
        <span className="badge badge-experimental">EXPERIMENTAL</span>
      </div>
      <div className="comparison-body">
        <span className="eyebrow">
          {smoothing === 'disabled'
            ? 'RAW FRAME PROBABILITIES'
            : `${smoothing.toUpperCase()} TEMPORAL SMOOTHING`}
        </span>
        <h3
          className={`neural-expression ${prediction?.primary.isUncertain ? 'neural-uncertain' : ''}`}
        >
          {prediction?.primary.isUncertain ? (
            <>
              <span aria-hidden="true">❔ </span>Uncertain
            </>
          ) : (
            (prediction?.primary.label ?? state)
          )}
        </h3>
        {prediction && (
          <>
            <p className="comparison-note">
              Highest probability:{' '}
              <strong>{(prediction.primary.confidence * 100).toFixed(1)}%</strong>
            </p>
            <p className="comparison-note">
              Top-two margin: {(prediction.primary.margin * 100).toFixed(1)} percentage points.
              {prediction.primary.isUncertain &&
                ` Ambiguous result; raw argmax: ${prediction.primary.rawLabel}.`}
            </p>
            <div className="probability-bars">
              {prediction.primary.distribution.map((row) => (
                <div key={row.label}>
                  <div>
                    <span>{row.label}</span>
                    <strong>{(row.probability * 100).toFixed(1)}%</strong>
                  </div>
                  <progress
                    max={1}
                    value={row.probability}
                    aria-label={`${row.label} probability`}
                  />
                </div>
              ))}
            </div>
            {showRaw && (
              <p className="raw-prediction">
                Raw frame interpretation:{' '}
                {prediction.raw.isUncertain ? 'Uncertain' : prediction.raw.label} · raw argmax:{' '}
                {prediction.raw.rawLabel} · {(prediction.raw.confidence * 100).toFixed(1)}%
                <br />
                {prediction.raw.distribution
                  .map((row) => `${row.label} ${row.probability.toFixed(3)}`)
                  .join(' · ')}
              </p>
            )}
          </>
        )}
        <p className="comparison-note">
          Visible expression categories, not actual emotions. Synthetic-data accuracy is not
          evidence of real-world performance.
        </p>
      </div>
    </section>
  )
}
