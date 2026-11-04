import { useMemo, useState } from 'react'
import { expressionLabels } from '../types/dataset'
import type { ExpressionLabel, FacialExpressionSample } from '../types/dataset'
import { FeatureVector } from './FeatureVector'
import { storageError } from '../lib/datasetStorage'

interface Actions {
  disabled: boolean
  onUpdate: (
    id: string,
    changes: { label: ExpressionLabel; participantId: string },
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
}
function SampleCard({
  sample,
  disabled,
  onUpdate,
  onDelete,
}: { sample: FacialExpressionSample } & Actions) {
  const [editing, setEditing] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [label, setLabel] = useState(sample.label)
  const [participant, setParticipant] = useState(sample.participantId)
  const [error, setError] = useState<string | null>(null)
  return (
    <article className="sample-card">
      <div className="sample-summary">
        <div>
          <strong>{sample.label}</strong>
          <span className="badge">{sample.source}</span>
          <p>{sample.participantId}</p>
        </div>
        <div className="sample-date">
          <time dateTime={sample.createdAt}>{new Date(sample.createdAt).toLocaleString()}</time>
          <small>{sample.sourceFileName ?? 'Webcam capture'}</small>
        </div>
      </div>
      <details className="sample-metadata">
        <summary>Sample & session IDs</summary>
        <p>Sample: {sample.id}</p>
        <p>Session: {sample.sessionId}</p>
      </details>
      <div className="sample-actions">
        <button
          className="text-button"
          aria-expanded={inspecting}
          onClick={() => setInspecting(!inspecting)}
        >
          {inspecting ? 'Hide' : 'Inspect'} 52 features
        </button>
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => {
            setLabel(sample.label)
            setParticipant(sample.participantId)
            setEditing(!editing)
            setError(null)
          }}
        >
          Edit
        </button>
        <button
          className="text-button danger-text"
          disabled={disabled}
          onClick={() => {
            void onDelete(sample.id).catch((cause: unknown) => setError(storageError(cause)))
          }}
        >
          Delete
        </button>
      </div>
      {editing && (
        <form
          className="sample-edit"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            void onUpdate(sample.id, { label, participantId: participant.trim() })
              .then(() => setEditing(false))
              .catch((cause: unknown) => setError(storageError(cause)))
          }}
        >
          <label>
            Label
            <select
              disabled={disabled}
              value={label}
              onChange={(event) => setLabel(event.target.value as ExpressionLabel)}
            >
              {expressionLabels.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Participant ID
            <input
              required
              maxLength={200}
              disabled={disabled}
              value={participant}
              onChange={(event) => setParticipant(event.target.value)}
            />
          </label>
          <button type="submit" className="button primary" disabled={disabled}>
            Save edits
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p className="dataset-error" role="alert">
          {error}
        </p>
      )}
      {inspecting && <FeatureVector features={sample.features} />}
    </article>
  )
}

export function SampleReview({
  samples,
  ...actions
}: { samples: FacialExpressionSample[] } & Actions) {
  const [label, setLabel] = useState('')
  const [participant, setParticipant] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(0)
  const filtered = useMemo(
    () =>
      samples
        .filter(
          (sample) =>
            (!label || sample.label === label) &&
            (!source || sample.source === source) &&
            sample.participantId.toLowerCase().includes(participant.trim().toLowerCase()),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)),
    [samples, label, source, participant],
  )
  const lastPage = Math.max(0, Math.ceil(filtered.length / 20) - 1)
  const currentPage = Math.min(page, lastPage)
  return (
    <section className="panel sample-review" aria-labelledby="review-title">
      <div className="panel-heading">
        <h2 id="review-title">Sample review</h2>
        <span className="badge">
          {filtered.length} / {samples.length} SAMPLES
        </span>
      </div>
      <div className="dataset-card-body">
        <div className="dataset-fields review-filters">
          <label>
            Expression
            <select
              value={label}
              onChange={(event) => {
                setLabel(event.target.value)
                setPage(0)
              }}
            >
              <option value="">All expressions</option>
              {expressionLabels.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Participant
            <input
              type="search"
              placeholder="Filter participant ID…"
              value={participant}
              onChange={(event) => {
                setParticipant(event.target.value)
                setPage(0)
              }}
            />
          </label>
          <label>
            Source
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
                setPage(0)
              }}
            >
              <option value="">All sources</option>
              <option value="synthetic">Synthetic</option>
              <option value="real">Real</option>
            </select>
          </label>
        </div>
        {filtered.length === 0 ? (
          <p className="dataset-empty">
            {samples.length
              ? 'No samples match these filters.'
              : 'Your dataset is empty. Import images or capture a real expression to begin.'}
          </p>
        ) : (
          <div className="sample-list">
            {filtered.slice(currentPage * 20, currentPage * 20 + 20).map((sample) => (
              <SampleCard key={sample.id} sample={sample} {...actions} />
            ))}
          </div>
        )}
        <div className="review-pagination">
          <button
            className="button secondary"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage + 1} / {lastPage + 1} · 20 per page
          </span>
          <button
            className="button secondary"
            disabled={currentPage >= lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
