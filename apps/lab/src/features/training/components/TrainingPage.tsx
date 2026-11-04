import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { datasetStorage, storageError } from '../../dataset/lib/datasetStorage'
import { datasetMetadata } from '../../dataset/lib/featureSchema'
import { parseDatasetJson } from '../../dataset/lib/datasetValidation'
import type { FacialExpressionDataset } from '../../dataset/types/dataset'
import { prepareTrainingSamples } from '../lib/prepareDataset'
import { splitDataset } from '../lib/splitDataset'
import type { PreparationReport } from '../types/training'
import { useTraining } from '../hooks/useTraining'
import { defaultTrainingConfig, splitNames, trainingLabels } from '../types/training'
import { LearningCurves } from './LearningCurves'
import { TrainingEvaluation } from './TrainingEvaluation'
import '../training.css'

export function TrainingPage({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [dataset, setDataset] = useState<FacialExpressionDataset | null>(null)
  const [source, setSource] = useState('IndexedDB snapshot')
  const [seedInput, setSeedInput] = useState('42')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const training = useTraining()
  const busy = training.status === 'training' || training.status === 'evaluating'
  const seed = seedInput.trim() === '' ? NaN : Number(seedInput)
  const prepared = useMemo(() => {
    let report: PreparationReport | null = null
    if (!dataset) return { data: null, report, error: null }
    try {
      const analyzed = prepareTrainingSamples(dataset)
      report = analyzed.report
      return {
        data: { ...splitDataset(analyzed.samples, seed), seed, report },
        report,
        error: null,
      }
    } catch (cause) {
      return {
        data: null,
        report,
        error: cause instanceof Error ? cause.message : 'Dataset validation failed.',
      }
    }
  }, [dataset, seed])
  const loadLocal = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    setError(null)
    setDataset(null)
    try {
      const samples = await datasetStorage.all()
      if (request.current === id) {
        setDataset({ ...datasetMetadata(), exportedAt: new Date().toISOString(), samples })
        setSource('IndexedDB snapshot')
      }
    } catch (cause) {
      if (request.current === id) setError(storageError(cause))
    } finally {
      if (request.current === id) setLoading(false)
    }
  }, [])
  useEffect(() => {
    // Synchronize once with the external browser database without mutating it.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadLocal()
    return () => {
      request.current += 1
    }
  }, [loadLocal])
  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])
  useEffect(() => {
    if (!busy) return
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [busy])
  const loadJson = async (file: File) => {
    const id = ++request.current
    training.reset()
    setDataset(null)
    setLoading(true)
    setError(null)
    try {
      const data = parseDatasetJson(await file.text())
      if (request.current === id) {
        setDataset(data)
        setSource(file.name)
      }
    } catch (cause) {
      if (request.current === id) setError(storageError(cause))
    } finally {
      if (request.current === id) setLoading(false)
    }
  }
  const current = training.history[training.history.length - 1]
  return (
    <div className="training-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow page-eyebrow">
            ExpressionLens Lab <span>/</span> MILESTONE 03
          </div>
          <h1>
            Classifier Training<span>.</span>
          </h1>
          <p>A small neural network. Participant-disjoint evaluation. Entirely in your browser.</p>
        </div>
        <span className="version-tag">TRAIN / 001</span>
      </div>
      <div className="privacy-banner">
        <span className="privacy-icon" aria-hidden="true">
          ◇
        </span>
        <p>
          <strong>Features stay on this device.</strong> Training runs locally in a worker.
          Synthetic-data metrics do not establish real-world performance.
        </p>
        <span className="privacy-chip">NO UPLOADS</span>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Dataset input & validation</h2>
          <span className="badge">52 FEATURES · 4 CLASSES</span>
        </div>
        <div className="training-body">
          <div className="training-input-actions">
            <button
              className="button secondary"
              disabled={busy || loading}
              onClick={() => {
                training.reset()
                void loadLocal()
              }}
            >
              Load IndexedDB dataset
            </button>
            <button
              className="button secondary"
              disabled={busy || loading}
              onClick={() => input.current?.click()}
            >
              Use dataset JSON
            </button>
            <input
              ref={input}
              className="sr-only"
              aria-label="Training dataset JSON"
              type="file"
              accept="application/json,.json"
              disabled={busy || loading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void loadJson(file)
              }}
            />
          </div>
          {loading && (
            <p className="training-note" role="status">
              Loading and validating dataset…
            </p>
          )}
          {dataset && (
            <p className="training-note">
              Input: {source} · {dataset.samples.length} original samples. The dataset is read as a
              snapshot and is never edited or deleted by training.
            </p>
          )}
          {prepared.report && (
            <>
              <dl className="training-metrics">
                <div>
                  <dt>Usable samples</dt>
                  <dd>{prepared.report.usableSamples}</dd>
                </div>
                <div>
                  <dt>Exact duplicates excluded</dt>
                  <dd>{prepared.report.duplicatesExcluded}</dd>
                </div>
                <div>
                  <dt>Duplicate vector groups</dt>
                  <dd>{prepared.report.duplicateGroups}</dd>
                </div>
                <div>
                  <dt>Conflicting groups excluded</dt>
                  <dd>{prepared.report.conflictingGroups}</dd>
                </div>
              </dl>
              <p className="training-note">
                Schema, model, feature order, labels, IDs and all 52 values validated. One
                representative is kept per identical, same-label vector; groups with contradictory
                labels are removed entirely ({prepared.report.conflictingSamplesExcluded} samples).
                No original records are changed.
              </p>
            </>
          )}
          {(error || prepared.error || training.error) && (
            <div className="dataset-error" role="alert">
              {error || prepared.error || training.error}
            </div>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Split & training configuration</h2>
          <span className="badge">70 / 15 / 15</span>
        </div>
        <div className="training-body">
          <label className="training-seed">
            Random seed
            <input
              type="number"
              min={0}
              max={4294967295}
              step={1}
              value={seedInput}
              disabled={busy || loading}
              onChange={(event) => {
                training.reset()
                setError(null)
                setSeedInput(event.target.value)
              }}
            />
          </label>
          <p className="training-note">
            Choose the seed before training; do not select models or seeds using test results. Every
            participant belongs to exactly one split. Group sizes and rounding can prevent exact
            percentages.
          </p>
          {prepared.data && (
            <>
              <div className="training-table-scroll">
                <table>
                  <caption>Actual sample counts per split and class</caption>
                  <thead>
                    <tr>
                      <th>Split</th>
                      {trainingLabels.map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                      <th>Total</th>
                      <th>People</th>
                    </tr>
                  </thead>
                  <tbody>
                    {splitNames.map((name) => (
                      <tr key={name}>
                        <th scope="row">{name}</th>
                        {prepared.data!.summary[name].perClass.map((count, index) => (
                          <td key={index}>{count}</td>
                        ))}
                        <td>{prepared.data!.summary[name].samples}</td>
                        <td>{prepared.data!.summary[name].participants}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="training-note">
                Test source: {prepared.data.summary.test.synthetic} synthetic /{' '}
                {prepared.data.summary.test.real} real samples.
              </p>
              {prepared.data.warnings.map((warning) => (
                <p className="training-warning" key={warning}>
                  {warning}
                </p>
              ))}
            </>
          )}
          <dl className="training-configuration">
            <div>
              <dt>Network</dt>
              <dd>52 → Dense 32 ReLU → Dense 16 ReLU → 4 Softmax</dd>
            </div>
            <div>
              <dt>Optimizer / loss</dt>
              <dd>
                Adam · learning rate {defaultTrainingConfig.learningRate} · categorical
                cross-entropy
              </dd>
            </div>
            <div>
              <dt>Fit</dt>
              <dd>
                Batch {defaultTrainingConfig.batchSize} · max. {defaultTrainingConfig.maxEpochs}{' '}
                epochs · seeded order
              </dd>
            </div>
            <div>
              <dt>Early stopping</dt>
              <dd>
                Validation loss · patience {defaultTrainingConfig.patience} · restore best weights
              </dd>
            </div>
            <div>
              <dt>Input / backend</dt>
              <dd>Raw coefficients [0,1] · CPU · dedicated browser worker</dd>
            </div>
          </dl>
          <div className="training-input-actions">
            <button
              className="button primary"
              disabled={!prepared.data || loading || busy}
              onClick={() => {
                setError(null)
                if (prepared.data) training.start(prepared.data, { ...defaultTrainingConfig, seed })
              }}
            >
              Start training
            </button>
            {busy && (
              <button className="button secondary" onClick={training.cancel}>
                Cancel training
              </button>
            )}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Training progress</h2>
          <span className="badge">{training.status.toUpperCase()}</span>
        </div>
        <div className="training-body">
          <progress
            className="training-progress"
            max={defaultTrainingConfig.maxEpochs}
            value={training.history.length}
            aria-label="Training epochs completed"
          />
          <p className="training-note" role="status">
            Epoch {training.history.length} / {defaultTrainingConfig.maxEpochs}
            {training.status === 'evaluating'
              ? ' · Restored the best weights; evaluating held-out test once…'
              : training.status === 'cancelled'
                ? ' · Cancelled; no model was saved.'
                : ''}
          </p>
          <dl className="training-metrics">
            <div>
              <dt>Training loss</dt>
              <dd>{current?.loss.toFixed(4) ?? '—'}</dd>
            </div>
            <div>
              <dt>Validation loss</dt>
              <dd>{current?.validationLoss.toFixed(4) ?? '—'}</dd>
            </div>
            <div>
              <dt>Training accuracy</dt>
              <dd>{current ? `${(current.accuracy * 100).toFixed(1)}%` : '—'}</dd>
            </div>
            <div>
              <dt>Validation accuracy</dt>
              <dd>{current ? `${(current.validationAccuracy * 100).toFixed(1)}%` : '—'}</dd>
            </div>
          </dl>
        </div>
      </section>
      <LearningCurves history={training.history} />
      {training.result && <TrainingEvaluation result={training.result} onError={setError} />}
    </div>
  )
}
