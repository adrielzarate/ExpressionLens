import { useEffect, useRef, useState } from 'react'
import { IdentityFields } from './IdentityFields'
import { createImageExtractor, imageAccept } from '../lib/imageFeatureExtraction'
import { datasetStorage, storageError } from '../lib/datasetStorage'
import { createImageBatch, createImageSample } from '../lib/imageBatch'
import type { ImageBatch } from '../lib/imageBatch'
import type { ImageImportMode, SampleIdentity } from '../types/dataset'

interface Progress {
  total: number
  completed: number
  saved: number
  failed: number
  cancelled: boolean
}
export function ImageBatchImporter({
  disabled,
  onActivity,
  onSaved,
}: {
  disabled: boolean
  onActivity: (active: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [identity, setIdentity] = useState<SampleIdentity>({
    participantId: '',
    label: 'neutral',
    source: 'synthetic',
  })
  const [mode, setMode] = useState<ImageImportMode>('different-identities')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [messages, setMessages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const extractor = useRef<ReturnType<typeof createImageExtractor> | null>(null)
  const cancelled = useRef(false)
  const locked = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancelled.current = true
      extractor.current?.dispose()
      extractor.current = null
    }
  }, [])

  const run = async (files: File[]) => {
    if (!files.length || locked.current || disabled) return
    let batch: ImageBatch
    try {
      batch = createImageBatch(identity, mode)
    } catch (cause) {
      setError(storageError(cause))
      return
    }
    locked.current = true
    cancelled.current = false
    setRunning(true)
    onActivity(true)
    setError(null)
    setMessages([])
    const counts: Progress = {
      total: files.length,
      completed: 0,
      saved: 0,
      failed: 0,
      cancelled: false,
    }
    setProgress({ ...counts })
    extractor.current ??= createImageExtractor()
    const worker = extractor.current
    try {
      for (const file of files) {
        if (cancelled.current) break
        let features: number[]
        try {
          features = await worker.extract(file)
        } catch (cause) {
          if (cancelled.current) break
          counts.failed += 1
          counts.completed += 1
          if (mounted.current) {
            setMessages((rows) => [...rows.slice(-99), `${file.name}: ${storageError(cause)}`])
            setProgress({ ...counts })
          }
          continue
        }
        if (cancelled.current) break
        const sample = createImageSample(batch, features, file.name)
        // Commit one sample at a time; never retain decoded photos or the whole batch in memory.
        await datasetStorage.add([sample])
        counts.saved += 1
        counts.completed += 1
        if (mounted.current) setProgress({ ...counts })
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }
    } catch (cause) {
      if (mounted.current)
        setError(`Batch stopped: ${storageError(cause)} Previously saved samples remain available.`)
    } finally {
      locked.current = false
      if (mounted.current) {
        setRunning(false)
        setProgress({ ...counts, cancelled: cancelled.current })
        onActivity(false)
        await onSaved()
      }
    }
  }
  return (
    <section className="panel dataset-card" aria-labelledby="images-title">
      <div className="panel-heading">
        <h2 id="images-title">Image batch import</h2>
        <span className="badge">ON-DEVICE</span>
      </div>
      <div className="dataset-card-body">
        <p>
          All images in a batch share the selected expression. Choose whether they show different
          synthetic identities or the same participant.
        </p>
        <fieldset disabled={disabled || running}>
          <legend className="sr-only">Image batch identity</legend>
          <label className="import-mode-field">
            Import mode
            <select
              value={mode}
              onChange={(event) => {
                const next = event.target.value as ImageImportMode
                setMode(next)
                if (next === 'different-identities')
                  setIdentity({ ...identity, source: 'synthetic' })
                setError(null)
              }}
            >
              <option value="different-identities">Different identities (synthetic)</option>
              <option value="same-identity">Same identity</option>
            </select>
          </label>
          <p className="import-mode-description">
            {mode === 'different-identities'
              ? 'Different identities: every image gets a unique automatic participant ID and is treated as a separate synthetic person. No participant ID is required.'
              : 'Same identity: every image shares your participant ID. Reuse it across batches and expressions of that same person.'}
          </p>
          <IdentityFields
            value={identity}
            showParticipant={mode === 'same-identity'}
            onChange={(value) => {
              if (value.source !== identity.source)
                setMode(value.source === 'synthetic' ? 'different-identities' : 'same-identity')
              setIdentity(value)
              setError(null)
            }}
          />
        </fieldset>
        <div
          className={`image-drop ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled && !running) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void run(Array.from(event.dataTransfer.files))
          }}
        >
          <p>Drop JPEG, PNG, or WebP images here</p>
          <small>Processed sequentially · photos are never saved</small>
          <button
            className="button secondary"
            disabled={disabled || running}
            onClick={() => inputRef.current?.click()}
          >
            Choose images
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={imageAccept}
            className="sr-only"
            aria-label="Choose image batch"
            disabled={disabled || running}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              void run(files)
            }}
          />
        </div>
        {progress && (
          <div className="batch-progress" role="status">
            <progress
              max={progress.total}
              value={progress.completed}
              aria-label="Image batch progress"
            />
            <p>
              {progress.completed} / {progress.total} processed · {progress.saved} saved ·{' '}
              {progress.failed} failed{progress.cancelled ? ' · cancelled' : ''}
            </p>
            <p>{progress.total - progress.completed} unprocessed</p>
          </div>
        )}
        {running && (
          <button
            className="button secondary"
            onClick={() => {
              cancelled.current = true
              extractor.current?.dispose()
              extractor.current = null
            }}
          >
            Cancel remaining images
          </button>
        )}
        {error && (
          <p className="dataset-error" role="alert">
            {error}
          </p>
        )}
        {messages.length > 0 && (
          <details className="batch-errors">
            <summary>
              Image failures ({progress?.failed}; latest {messages.length} shown)
            </summary>
            <ul>
              {messages.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}
