import { useEffect, useState } from 'react'
import { useDataset } from '../hooks/useDataset'
import { DatasetOverview } from './DatasetOverview'
import { ImageBatchImporter } from './ImageBatchImporter'
import { WebcamCollector } from './WebcamCollector'
import { SampleReview } from './SampleReview'
import { DatasetFiles } from './DatasetFiles'
import '../dataset.css'

export function DatasetCollector({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const dataset = useDataset()
  const [activity, setActivity] = useState<'images' | 'webcam' | null>(null)
  const [mode, setMode] = useState<'images' | 'webcam'>('images')
  const locked = dataset.busy || activity !== null
  useEffect(() => {
    onBusyChange(locked)
    return () => onBusyChange(false)
  }, [locked, onBusyChange])
  useEffect(() => {
    if (!locked) return
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [locked])
  return (
    <div className="dataset-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow page-eyebrow">
            ExpressionLens Lab <span>/</span> MILESTONE 02.1
          </div>
          <h1>
            Dataset Collector<span>.</span>
          </h1>
          <p>Labeled facial movements. Anonymous participants. Local features only.</p>
        </div>
        <span className="version-tag">DATA / 001</span>
      </div>
      <div className="privacy-banner">
        <span className="privacy-icon" aria-hidden="true">
          ◇
        </span>
        <p>
          <strong>Only numbers stay.</strong> Photos and video are processed locally. Only 52
          coefficients and metadata are saved on this device.
        </p>
        <span className="privacy-chip">NO UPLOADS</span>
      </div>
      {dataset.loading && (
        <p role="status" className="loading-notice">
          Opening local dataset…
        </p>
      )}
      {dataset.error && (
        <div className="error-banner" role="alert">
          <p>
            {dataset.error}{' '}
            <button
              className="text-button"
              disabled={locked}
              onClick={() => {
                void dataset.refresh()
              }}
            >
              Retry local storage
            </button>
          </p>
        </div>
      )}
      <DatasetOverview samples={dataset.samples} />
      <div className="collection-mode" role="group" aria-label="Collection source">
        <button
          aria-pressed={mode === 'images'}
          disabled={locked}
          onClick={() => setMode('images')}
        >
          Import images
        </button>
        <button
          aria-pressed={mode === 'webcam'}
          disabled={locked}
          onClick={() => setMode('webcam')}
        >
          Capture with webcam
        </button>
      </div>
      {mode === 'images' ? (
        <ImageBatchImporter
          disabled={dataset.loading || dataset.busy || !!dataset.error}
          onActivity={(active) => setActivity(active ? 'images' : null)}
          onSaved={dataset.refresh}
        />
      ) : (
        <WebcamCollector
          disabled={dataset.loading || dataset.busy || !!dataset.error}
          onActivity={(active) => setActivity(active ? 'webcam' : null)}
          onSave={dataset.add}
        />
      )}
      <DatasetFiles
        samples={dataset.samples}
        disabled={locked || dataset.loading}
        onAdd={dataset.add}
        onClear={dataset.clear}
        onRefresh={dataset.refresh}
      />
      <SampleReview
        samples={dataset.samples}
        disabled={locked || dataset.loading}
        onUpdate={dataset.update}
        onDelete={dataset.remove}
      />
      <p className="dataset-footer-note">
        Labels describe visible expressions, not verified emotions. No identity recognition,
        training, or automatic data splitting is performed.
      </p>
    </div>
  )
}
