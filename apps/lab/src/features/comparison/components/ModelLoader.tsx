import { useState } from 'react'
import type { ClassifierFiles, LoadedClassifier } from '../types/comparison'

export function ModelLoader({
  model,
  status,
  error,
  onLoad,
  onUnload,
}: {
  model: LoadedClassifier | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  onLoad: (files: ClassifierFiles) => Promise<boolean>
  onUnload: () => void
}) {
  const [modelFile, setModelFile] = useState<File | null>(null)
  const [weights, setWeights] = useState<File[]>([])
  const [metadata, setMetadata] = useState<File | null>(null)
  const [expanded, setExpanded] = useState(true)
  return (
    <section className="panel classifier-loader" aria-labelledby="classifier-loader-title">
      <div className="panel-heading">
        <h2 id="classifier-loader-title">Neural classifier model</h2>
        <span className={`badge ${status === 'ready' ? 'badge-live' : ''}`}>
          {status.toUpperCase()}
        </span>
      </div>
      <div className="comparison-body">
        {model ? (
          <div className="loaded-model-info">
            <strong>{model.name}</strong>
            <span>ID {model.id}</span>
            <span>
              52 inputs → 4 probabilities · CPU · trained{' '}
              {model.metadata.trainedAt ?? 'date unavailable'}
            </span>
            <span>MediaPipe: {model.metadata.modelInfo.version} · SHA-256 verified</span>
            <span>Labels: {model.metadata.labelOrder.join(', ')} · preprocessing: none</span>
            <span>
              Exported evaluation domain: {model.metadata.evaluationDomain ?? 'not provided'}. These
              metrics do not establish real-world performance.
            </span>
          </div>
        ) : (
          <p className="comparison-note">
            {status === 'loading'
              ? 'Loading and checking local model files…'
              : 'No neural model loaded. The rule-based detector remains available.'}
          </p>
        )}
        <div className="comparison-actions">
          <button
            className="text-button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide file selection' : 'Load / replace model files'}
          </button>
          {(model || status === 'loading') && (
            <button className="button secondary" onClick={onUnload}>
              {status === 'loading' ? 'Cancel loading' : 'Unload model'}
            </button>
          )}
        </div>
        {expanded && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (modelFile && metadata && weights.length)
                void onLoad({ model: modelFile, weights, metadata }).then((success) => {
                  if (success) setExpanded(false)
                })
            }}
          >
            <fieldset disabled={status === 'loading'}>
              <legend className="sr-only">Classifier files from one exported training run</legend>
              <div className="classifier-files">
                <label>
                  Model JSON
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => setModelFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <label>
                  Weight file(s)
                  <input
                    type="file"
                    multiple
                    onChange={(event) => setWeights(Array.from(event.target.files ?? []))}
                  />
                </label>
                <label>
                  Metadata JSON
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => setMetadata(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <p className="comparison-note">
                Choose model.json, every referenced weight file, and metadata.json from the same
                training run. Files stay on this device. Loading a replacement unloads the current
                model.
              </p>
              <button
                className="button primary"
                type="submit"
                disabled={!modelFile || !metadata || !weights.length || status === 'loading'}
              >
                Load selected model
              </button>
            </fieldset>
          </form>
        )}
        {error && (
          <p className="dataset-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
