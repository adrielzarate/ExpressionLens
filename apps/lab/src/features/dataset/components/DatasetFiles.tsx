import { useMemo, useRef, useState } from 'react'
import { downloadDataset } from '../lib/datasetExport'
import { parseDatasetJson, planDatasetImport } from '../lib/datasetValidation'
import { datasetStatistics } from '../lib/datasetStatistics'
import { storageError } from '../lib/datasetStorage'
import type { FacialExpressionDataset, FacialExpressionSample } from '../types/dataset'

export function DatasetFiles({
  samples,
  disabled,
  onAdd,
  onClear,
  onRefresh,
}: {
  samples: FacialExpressionSample[]
  disabled: boolean
  onAdd: (rows: readonly FacialExpressionSample[]) => Promise<void>
  onClear: () => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [incoming, setIncoming] = useState<FacialExpressionDataset | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [reading, setReading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const plan = useMemo(
    () =>
      incoming
        ? planDatasetImport(
            incoming,
            samples.map((sample) => sample.id),
          )
        : null,
    [incoming, samples],
  )
  const stats = useMemo(() => (incoming ? datasetStatistics(incoming.samples) : null), [incoming])
  const preview = async (file: File) => {
    setReading(true)
    setError(null)
    setMessage('')
    setIncoming(null)
    try {
      const dataset = parseDatasetJson(await file.text())
      setIncoming(dataset)
      setFileName(file.name)
    } catch (cause) {
      setError(storageError(cause))
    } finally {
      setReading(false)
    }
  }
  const commit = async () => {
    if (!plan || !plan.additions.length) return
    const count = plan.additions.length
    try {
      await onAdd(plan.additions)
      setIncoming(null)
      setMessage(`Imported ${count} samples. Existing sample IDs were preserved.`)
    } catch (cause) {
      setError(storageError(cause))
      await onRefresh()
    }
  }
  return (
    <section className="panel dataset-files" aria-labelledby="dataset-files-title">
      <div className="panel-heading">
        <h2 id="dataset-files-title">Local dataset & JSON</h2>
        <span className="badge">INDEXEDDB</span>
      </div>
      <div className="dataset-card-body">
        <p>
          Stored only in this browser on this origin. Export a backup before clearing browser data
          or changing devices.
        </p>
        <div className="dataset-file-actions">
          <button
            className="button secondary"
            disabled={disabled || reading}
            onClick={() => {
              try {
                downloadDataset(samples)
                setError(null)
              } catch (cause) {
                setError(storageError(cause))
              }
            }}
          >
            Export dataset JSON
          </button>
          <button
            className="button secondary"
            disabled={disabled || reading}
            onClick={() => inputRef.current?.click()}
          >
            {reading ? 'Validating…' : 'Import dataset JSON'}
          </button>
          <button
            className="button secondary danger-text"
            disabled={disabled || !samples.length || reading}
            onClick={() => {
              setConfirmClear(true)
              setConfirmation('')
            }}
          >
            Clear dataset
          </button>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          aria-label="Import dataset JSON file"
          type="file"
          accept="application/json,.json"
          disabled={disabled || reading}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void preview(file)
          }}
        />
        {incoming && plan && stats && (
          <div className="import-summary">
            <h3>Review JSON import</h3>
            <p>
              {fileName} · schema v{incoming.schemaVersion} · {incoming.modelInfo.version}
            </p>
            <p>
              {plan.total} samples in file · <strong>{plan.additions.length} new</strong> ·{' '}
              {plan.duplicateCount} existing IDs skipped
            </p>
            <p>
              {stats.participants} participants · {stats.sessions} sessions · {stats.synthetic}{' '}
              synthetic / {stats.real} real
            </p>
            <p>{stats.classes.map((row) => `${row.label}: ${row.samples}`).join(' · ')}</p>
            <p>
              All 52 names, their ordering, model identity, and sample values were validated. Legacy
              frown labels are mapped to angry. Existing IDs are skipped even if their contents
              differ. No existing sample will be overwritten.
            </p>
            <div className="button-group">
              <button
                className="button primary"
                disabled={disabled || !plan.additions.length}
                onClick={() => {
                  void commit()
                }}
              >
                Import {plan.additions.length} new samples
              </button>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => setIncoming(null)}
              >
                Cancel import
              </button>
            </div>
          </div>
        )}
        {confirmClear && (
          <div className="clear-confirmation" role="group" aria-labelledby="clear-title">
            <h3 id="clear-title">Delete all saved samples?</h3>
            <p>This cannot be undone here. Export a JSON backup first. Type DELETE to confirm.</p>
            <label>
              Confirmation
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <div className="button-group">
              <button
                className="button danger-button"
                disabled={disabled || confirmation !== 'DELETE'}
                onClick={() => {
                  void onClear()
                    .then(() => {
                      setConfirmClear(false)
                      setIncoming(null)
                      setMessage('Dataset cleared.')
                    })
                    .catch((cause: unknown) => setError(storageError(cause)))
                }}
              >
                Delete all samples
              </button>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => setConfirmClear(false)}
              >
                Keep dataset
              </button>
            </div>
          </div>
        )}
        {message && (
          <p className="collection-hint" role="status">
            {message}
          </p>
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
