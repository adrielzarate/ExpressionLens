import type { LoadedClassifier, PairedPrediction } from '../types/comparison'

export function LiveDiagnostics({
  fps,
  model,
  prediction,
  error,
}: {
  fps: number
  model: LoadedClassifier | null
  prediction: PairedPrediction | null
  error: string | null
}) {
  return (
    <section className="panel compact-neural-diagnostics" aria-label="Live classifier diagnostics">
      <dl>
        <div>
          <dt>MediaPipe FPS</dt>
          <dd>{fps.toFixed(1)}</dd>
        </div>
        <div>
          <dt>NN inference</dt>
          <dd>{prediction ? `${prediction.inferenceMs.toFixed(2)} ms` : '—'}</dd>
        </div>
        <div>
          <dt>NN highest probability</dt>
          <dd>{prediction ? `${(prediction.primary.confidence * 100).toFixed(1)}%` : '—'}</dd>
        </div>
        <div>
          <dt>Model ID</dt>
          <dd>{model ? `${model.name} / ${model.id.slice(0, 8)}` : 'None'}</dd>
        </div>
        <div>
          <dt>Shared frame</dt>
          <dd>
            {prediction && prediction.frame.timestampMs !== null
              ? `${prediction.frame.timestampMs.toFixed(1)} ms`
              : '—'}
          </dd>
        </div>
      </dl>
      {error && (
        <p className="dataset-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
