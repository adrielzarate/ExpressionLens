import type { EpochMetrics } from '../types/training'

function Curve({ history, accuracy }: { history: EpochMetrics[]; accuracy: boolean }) {
  const train = history.map((row) => (accuracy ? row.accuracy : row.loss))
  const validation = history.map((row) => (accuracy ? row.validationAccuracy : row.validationLoss))
  const max = accuracy ? 1 : Math.max(0.1, ...train, ...validation) * 1.1
  const points = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${38 + (index / Math.max(1, values.length - 1)) * 300},${150 - (value / max) * 125}`,
      )
      .join(' ')
  return (
    <div className="learning-curve">
      <h3>{accuracy ? 'Accuracy' : 'Loss'}</h3>
      {!history.length ? (
        <p className="training-placeholder">
          The learning curve will appear after the first epoch.
        </p>
      ) : (
        <svg
          viewBox="0 0 365 185"
          role="img"
          aria-label={`${accuracy ? 'Accuracy' : 'Loss'} by epoch, training in green and validation in orange`}
        >
          <path d="M38 20V150H345" fill="none" stroke="#b9c8b0" />
          <path d="M38 87.5H345" stroke="#e5ebdf" strokeDasharray="3 4" />
          <text x="32" y="29" textAnchor="end">
            {accuracy ? '100%' : max.toFixed(2)}
          </text>
          <text x="30" y="153" textAnchor="end">
            0
          </text>
          <text x="38" y="173">
            1
          </text>
          <text x="338" y="173" textAnchor="end">
            {history.length}
          </text>
          <text x="190" y="180" textAnchor="middle">
            Epoch
          </text>
          <polyline points={points(train)} fill="none" stroke="#3e7e51" strokeWidth="2" />
          <polyline points={points(validation)} fill="none" stroke="#bd8250" strokeWidth="2" />
          <circle
            cx={history.length > 1 ? 338 : 38}
            cy={150 - (train[train.length - 1] / max) * 125}
            r="2.5"
            fill="#3e7e51"
          />
          <circle
            cx={history.length > 1 ? 338 : 38}
            cy={150 - (validation[validation.length - 1] / max) * 125}
            r="2.5"
            fill="#bd8250"
          />
        </svg>
      )}
    </div>
  )
}
export function LearningCurves({ history }: { history: EpochMetrics[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Learning curves</h2>
        <span className="curve-legend">
          <i />
          Training <i />
          Validation
        </span>
      </div>
      <div className="learning-curves">
        <Curve history={history} accuracy={false} />
        <Curve history={history} accuracy />
      </div>
      {!!history.length && (
        <details className="epoch-history">
          <summary>Inspect all epoch metrics</summary>
          <div className="training-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Epoch</th>
                  <th>Loss</th>
                  <th>Val loss</th>
                  <th>Accuracy</th>
                  <th>Val accuracy</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.epoch}>
                    <td>{row.epoch}</td>
                    <td>{row.loss.toFixed(4)}</td>
                    <td>{row.validationLoss.toFixed(4)}</td>
                    <td>{(row.accuracy * 100).toFixed(1)}%</td>
                    <td>{(row.validationAccuracy * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}
