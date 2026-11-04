import { trainingLabels } from '../types/training'
import type { TrainingResult } from '../types/training'
import { downloadTrainingFile } from '../lib/modelExport'

export function TrainingEvaluation({
  result,
  onError,
}: {
  result: TrainingResult
  onError: (error: string) => void
}) {
  const { metrics } = result
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Held-out test evaluation</h2>
          <span className="badge">{metrics.sampleCount} TEST SAMPLES</span>
        </div>
        <div className="training-body">
          <div className="evaluation-notice">
            <strong>
              {result.evaluationDomain === 'synthetic'
                ? 'Synthetic-data evaluation'
                : result.evaluationDomain === 'mixed'
                  ? 'Mixed collected-data evaluation'
                  : 'Collected-data evaluation'}
            </strong>
            <p>
              These results do not establish real-world performance. The classifier predicts visible
              facial expression categories, not a person’s emotional state.
            </p>
          </div>
          <dl className="training-metrics">
            <div>
              <dt>Test accuracy</dt>
              <dd>{percent(metrics.accuracy)}</dd>
            </div>
            <div>
              <dt>Test macro-F1</dt>
              <dd>{percent(metrics.macroF1)}</dd>
            </div>
            <div>
              <dt>Test samples</dt>
              <dd>{metrics.sampleCount}</dd>
            </div>
            <div>
              <dt>Best validation epoch</dt>
              <dd>{result.bestEpoch}</dd>
            </div>
          </dl>
          <p className="training-note">
            Evaluated once after restoring the best validation-loss checkpoint.{' '}
            {result.history.length} epochs completed ·{' '}
            {result.stopReason === 'early-stopping' ? 'Early stopping' : 'Maximum epochs reached'}.
          </p>
          <div className="training-table-scroll">
            <table>
              <caption>Per-class held-out test metrics</caption>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                  <th>Support</th>
                </tr>
              </thead>
              <tbody>
                {metrics.perClass.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{percent(row.precision)}</td>
                    <td>{percent(row.recall)}</td>
                    <td>{percent(row.f1)}</td>
                    <td>{row.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="training-table-scroll">
            <table className="confusion-matrix">
              <caption>Confusion matrix · rows = actual · columns = predicted</caption>
              <thead>
                <tr>
                  <th scope="col">
                    Actual ↓<br />
                    Predicted →
                  </th>
                  {trainingLabels.map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.confusionMatrix.map((row, index) => (
                  <tr key={trainingLabels[index]}>
                    <th scope="row">{trainingLabels[index]}</th>
                    {row.map((value, column) => (
                      <td className={index === column ? 'matrix-diagonal' : ''} key={column}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Export trained classifier</h2>
          <span className="badge">LOCAL FILES</span>
        </div>
        <div className="training-body">
          <p className="training-note">
            Download all three files from this run and keep them together. model.json references
            weights.bin. Metadata records labels, features, MediaPipe identity, seed, split
            membership, training history, and test metrics.
          </p>
          <div className="training-export-buttons">
            {(['model.json', 'weights.bin', 'metadata.json'] as const).map((name) => (
              <button
                className="button secondary"
                key={name}
                onClick={() => {
                  try {
                    downloadTrainingFile(result, name)
                  } catch (cause) {
                    onError(cause instanceof Error ? cause.message : 'Download failed.')
                  }
                }}
              >
                Download {name}
              </button>
            ))}
          </div>
          <p className="training-note">
            This milestone exports the model only. It does not replace the live rule-based detector.
            Leaving this tab discards the in-memory trained model files; download them first.
          </p>
        </div>
      </section>
    </>
  )
}
