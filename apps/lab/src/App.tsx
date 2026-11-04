import { useState } from 'react'
import { FacialExpressionLab } from './components/FacialExpressionLab'
import { DatasetCollector } from './features/dataset/components/DatasetCollector'
import { TrainingPage } from './features/training/components/TrainingPage'
import { InspectorPage } from './features/inspector/components/InspectorPage'
import type { InspectorSnapshot } from './features/inspector/types'
import './App.css'

function App() {
  const [view, setView] = useState<'lab' | 'dataset' | 'training' | 'inspector'>('lab')
  const [collectorBusy, setCollectorBusy] = useState(false)
  const [trainingBusy, setTrainingBusy] = useState(false)
  const [inspectorBusy, setInspectorBusy] = useState(false)
  const [snapshots, setSnapshots] = useState<InspectorSnapshot[]>([])
  const busy = collectorBusy || trainingBusy || inspectorBusy
  return (
    <>
      <header className="site-header">
        <a href="./" className="brand" aria-label="ExpressionLens Lab home">
          <span className="brand-mark" aria-hidden="true">
            ◧
          </span>{' '}
          Expression<span className="brand-light">Lens</span>
          {'\u00a0'}Lab
          <span className="brand-period">.</span>
        </a>
        <span className="local-badge">
          <i /> ON-DEVICE LAB
        </span>
      </header>
      <main>
        <nav className="app-navigation" aria-label="Application views">
          <button
            aria-current={view === 'lab' ? 'page' : undefined}
            disabled={busy}
            onClick={() => setView('lab')}
          >
            Facial Expression Lab
          </button>
          <button
            aria-current={view === 'dataset' ? 'page' : undefined}
            disabled={busy}
            onClick={() => setView('dataset')}
          >
            Dataset Collector
          </button>
          <button
            aria-current={view === 'training' ? 'page' : undefined}
            disabled={busy}
            onClick={() => setView('training')}
          >
            Training
          </button>
          <button
            aria-current={view === 'inspector' ? 'page' : undefined}
            disabled={busy}
            onClick={() => setView('inspector')}
          >
            Blendshape Inspector
          </button>
        </nav>
        {view === 'lab' ? (
          <FacialExpressionLab />
        ) : view === 'inspector' ? (
          <InspectorPage
            snapshots={snapshots}
            onSnapshotsChange={setSnapshots}
            onBusyChange={setInspectorBusy}
          />
        ) : view === 'training' ? (
          <TrainingPage onBusyChange={setTrainingBusy} />
        ) : (
          <DatasetCollector onBusyChange={setCollectorBusy} />
        )}
      </main>
    </>
  )
}
export default App
