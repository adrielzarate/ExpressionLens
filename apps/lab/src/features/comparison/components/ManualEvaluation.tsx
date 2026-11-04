import { useState } from 'react'
import { expressionLabels } from '../../dataset/types/dataset'
import type { ExpressionLabel } from '../../dataset/types/dataset'
import type { ManualEvaluationSample, PairedPrediction } from '../types/comparison'
import {
  captureEvaluation,
  downloadManualEvaluation,
  manualAccuracy,
} from '../lib/manualEvaluation'

export function ManualEvaluation({ prediction }: { prediction: PairedPrediction | null }) {
  const [target, setTarget] = useState<ExpressionLabel | ''>('')
  const [samples, setSamples] = useState<ManualEvaluationSample[]>([])
  const [error, setError] = useState<string | null>(null)
  const metrics = manualAccuracy(samples)
  const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`)
  return (
    <section className="panel manual-evaluation" aria-labelledby="manual-title">
      <div className="panel-heading">
        <h2 id="manual-title">Manual expression evaluation</h2>
        <span className="badge">{samples.length} CAPTURES</span>
      </div>
      <div className="comparison-body">
        <p className="comparison-note">
          The target is your intended expression, not objective ground truth. Each capture uses the
          same frame for both predictions. Only numerical results are held in memory; nothing is
          added to the training dataset.
        </p>
        <p className="comparison-note">
          Both detectors support neutral, smile, surprise and angry. Heuristic thresholds are
          experimental movement hypotheses. Reported accuracy means agreement with your selected
          intention.
        </p>
        {!prediction && (
          <p className="comparison-note">
            Load a compatible model, enable comparison mode, and keep exactly one face in view to
            capture paired predictions.
          </p>
        )}
        <div className="manual-capture-controls">
          <label>
            Intended expression
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value as ExpressionLabel | '')}
            >
              <option value="">Select a target…</option>
              {expressionLabels.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            disabled={!target || !prediction}
            onClick={() => {
              if (!target || !prediction) return
              try {
                const row = captureEvaluation(target, prediction)
                setSamples((rows) => [...rows, row])
                setError(null)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Capture failed.')
              }
            }}
          >
            Capture evaluation sample
          </button>
          <button
            className="button secondary"
            disabled={!samples.length}
            onClick={() => {
              try {
                downloadManualEvaluation(samples)
                setError(null)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Export failed.')
              }
            }}
          >
            Export evaluation JSON
          </button>
          <button
            className="text-button"
            disabled={!samples.length}
            onClick={() => {
              setSamples([])
              setError(null)
            }}
          >
            Clear evaluation rows
          </button>
        </div>
        <div className="manual-scores">
          <span>
            Rule-based agreement: <strong>{percent(metrics.ruleAccuracy)}</strong>
          </span>
          <span>
            Neural four-class agreement: <strong>{percent(metrics.neuralAccuracy)}</strong>
          </span>
          <span>{metrics.count} manually captured samples</span>
        </div>
        {!!samples.length && (
          <div className="manual-table">
            <table>
              <caption>
                Different model/settings can occur across rows; the JSON includes per-model
                summaries and raw probabilities. Neural agreement and checkmarks score the
                four-class argmax, not uncertainty.
              </caption>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Target</th>
                  <th>Rules</th>
                  <th>Neural interpretation / raw argmax</th>
                  <th>Probability</th>
                  <th>ms</th>
                  <th>Model / smoothing</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.timestamp).toLocaleTimeString()}</td>
                    <td>{row.targetLabel}</td>
                    <td>
                      {row.rulePrediction} {row.rulePrediction === row.targetLabel ? '✓' : '✕'}
                    </td>
                    <td>
                      {row.neuralInterpretedLabel === 'uncertain'
                        ? '❔ Uncertain · raw argmax: '
                        : ''}
                      {row.neuralPrediction} {row.neuralPrediction === row.targetLabel ? '✓' : '✕'}
                    </td>
                    <td>
                      {(
                        (row.neuralProbabilities.find((p) => p.label === row.neuralPrediction)
                          ?.probability ?? 0) * 100
                      ).toFixed(1)}
                      %
                    </td>
                    <td>{row.inferenceMs.toFixed(2)}</td>
                    <td>
                      {row.modelName} · {row.modelId.slice(0, 8)} / {row.smoothing}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && (
          <p className="dataset-error" role="alert">
            {error}
          </p>
        )}
        <p className="comparison-note">
          Export before leaving this lab. Captures are not persisted across reloads. No photos or
          video are recorded.
        </p>
      </div>
    </section>
  )
}
