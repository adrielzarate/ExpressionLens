import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { InspectorLive } from './InspectorLive'
import { VectorComparison } from './VectorComparison'
import { SnapshotDetails } from './SnapshotDetails'
import { meanVector } from '../lib/comparison'
import { downloadSnapshots, mergeSnapshots, parseInspectorJSON } from '../lib/serialization'
import type { InspectorSnapshot } from '../types'
import '../inspector.css'

export function InspectorPage({
  snapshots,
  onSnapshotsChange,
  onBusyChange,
}: {
  snapshots: InspectorSnapshot[]
  onSnapshotsChange: Dispatch<SetStateAction<InspectorSnapshot[]>>
  onBusyChange: (busy: boolean) => void
}) {
  const [a, setA] = useState(''),
    [b, setB] = useState('')
  const [groupA, setGroupA] = useState<string[]>([]),
    [groupB, setGroupB] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const captureBusy = useCallback(
    (value: boolean) => {
      setCapturing(value)
      onBusyChange(value)
    },
    [onBusyChange],
  )
  const onCaptured = useCallback(
    (snapshot: InspectorSnapshot) => onSnapshotsChange((rows) => [...rows, snapshot]),
    [onSnapshotsChange],
  )
  const left = snapshots.find((row) => row.id === a) ?? snapshots[0]
  const right = snapshots.find((row) => row.id === b) ?? snapshots[1]
  const means = useMemo(() => {
    const x = snapshots.filter((row) => groupA.includes(row.id)),
      y = snapshots.filter((row) => groupB.includes(row.id))
    return x.length && y.length
      ? {
          a: meanVector(x.map((r) => r.features)),
          b: meanVector(y.map((r) => r.features)),
          countA: x.length,
          countB: y.length,
        }
      : null
  }, [snapshots, groupA, groupB])
  const toggle = (id: string, group: 'a' | 'b', selected: boolean) => {
    const update = (rows: string[]) =>
      selected
        ? [...rows.filter((value) => value !== id), id]
        : rows.filter((value) => value !== id)
    if (group === 'a') {
      setGroupA(update)
      if (selected) setGroupB((rows) => rows.filter((value) => value !== id))
    } else {
      setGroupB(update)
      if (selected) setGroupA((rows) => rows.filter((value) => value !== id))
    }
  }
  return (
    <div className="inspector-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">ExpressionLens Lab / MILESTONE 05</div>
          <h1>
            Blendshape Inspector<span>.</span>
          </h1>
          <p>Capture movements, inspect patterns, compare expressions. Entirely on your device.</p>
        </div>
      </div>
      <div className="privacy-banner">
        <p>
          No images or video are stored or uploaded. Diagnostic snapshots stay separate from the
          training dataset, in this app session only. Export before reloading.
        </p>
      </div>
      <details className="panel inspector-guide" open>
        <summary>Guided comparison: smile and clenched teeth</summary>
        <ol>
          <li>Select smile, make a smile showing teeth, and capture a snapshot.</li>
          <li>Select angry, make an angry expression showing clenched teeth, and capture again.</li>
          <li>
            Select those snapshots as A and B below. Inspect the largest differences and both
            predictions.
          </li>
          <li>
            Repeat captures if useful, assign them to groups A and B, and compare mean activations.
            You can use any expression pair.
          </li>
        </ol>
        <p>
          These diagnostics do not establish emotions or explain why a classifier made a prediction.
        </p>
      </details>
      <InspectorLive
        onCaptured={onCaptured}
        onBusyChange={captureBusy}
        blocked={importing}
        full={snapshots.length >= 10000}
      />
      <section className="panel inspector-history" aria-label="Captured snapshots">
        <div className="panel-heading">
          <h2>Captured snapshots ({snapshots.length})</h2>
        </div>
        <fieldset
          className="inspector-model-controls comparison-body"
          disabled={capturing || importing}
        >
          <legend className="sr-only">Snapshot management</legend>
          <div className="comparison-actions">
            <button
              className="button secondary"
              disabled={!snapshots.length}
              onClick={() => {
                try {
                  downloadSnapshots(snapshots)
                  setError(null)
                } catch {
                  setError('Snapshot export failed.')
                }
              }}
            >
              Export inspector JSON
            </button>
            <label>
              Import inspector JSON
              <input
                type="file"
                accept=".json,application/json"
                disabled={importing}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  setImporting(true)
                  onBusyChange(true)
                  setError(null)
                  try {
                    if (file.size > 50_000_000) throw new Error('Inspector JSON exceeds 50 MB.')
                    const imported = parseInspectorJSON(await file.text())
                    const merged = mergeSnapshots(snapshots, imported)
                    onSnapshotsChange(merged)
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Import failed.')
                  } finally {
                    setImporting(false)
                    onBusyChange(false)
                  }
                }}
              />
            </label>
            <button
              className="text-button"
              disabled={!snapshots.length || importing}
              onClick={() => {
                onSnapshotsChange([])
                setGroupA([])
                setGroupB([])
                setA('')
                setB('')
              }}
            >
              Clear snapshots
            </button>
          </div>
          {error && (
            <p role="alert" className="dataset-error">
              {error}
            </p>
          )}
          {!snapshots.length && (
            <p>No snapshots yet. Start the camera or import an inspector JSON export.</p>
          )}
          <div className="inspector-snapshot-list">
            {snapshots.map((row, index) => (
              <article className="inspector-snapshot" key={row.id}>
                <h3>
                  #{index + 1} · {row.label}
                </h3>
                <p>
                  <time>{row.timestamp}</time> · ID {row.id}
                </p>
                {row.description && <p>{row.description}</p>}
                <p>
                  Rule: <strong>{row.rule.expression.label}</strong>
                  {row.rule.ambiguous ? ' (ambiguous fallback)' : ''} · Scores:{' '}
                  {Object.entries(row.rule.scores)
                    .map(([key, value]) => `${key} ${value.toFixed(3)}`)
                    .join(' / ')}
                </p>
                {row.neural.status === 'available' ? (
                  <>
                    <p>
                      Neural:{' '}
                      <strong
                        className={
                          row.neural.prediction.isUncertain ? 'neural-uncertain' : undefined
                        }
                      >
                        {row.neural.prediction.isUncertain
                          ? '❔ Uncertain'
                          : row.neural.prediction.label}
                      </strong>{' '}
                      · Highest probability {(row.neural.prediction.confidence * 100).toFixed(2)}%
                    </p>
                    <p>
                      Raw argmax: {row.neural.prediction.rawLabel} · Top-two margin:{' '}
                      {(row.neural.prediction.margin * 100).toFixed(1)} percentage points.
                    </p>
                    <p>
                      {row.neural.prediction.distribution
                        .map((entry) => `${entry.label}: ${(entry.probability * 100).toFixed(2)}%`)
                        .join(' / ')}
                    </p>
                    <p>
                      Neural model: {row.neural.modelName} · {row.neural.modelId}
                    </p>
                  </>
                ) : (
                  <p>Neural prediction unavailable: {row.neural.reason}</p>
                )}
                <SnapshotDetails row={row} />
                <div className="comparison-actions">
                  <label>
                    <input
                      type="checkbox"
                      checked={groupA.includes(row.id)}
                      onChange={(e) => toggle(row.id, 'a', e.target.checked)}
                    />
                    Group A · #{index + 1}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={groupB.includes(row.id)}
                      onChange={(e) => toggle(row.id, 'b', e.target.checked)}
                    />
                    Group B · #{index + 1}
                  </label>
                  <button
                    className="text-button"
                    onClick={() =>
                      onSnapshotsChange((rows) => rows.filter((item) => item.id !== row.id))
                    }
                  >
                    Delete snapshot #{index + 1}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </fieldset>
      </section>
      {snapshots.length >= 2 && (
        <>
          <div className="panel inspector-pair-controls">
            {(['a', 'b'] as const).map((side) => (
              <label key={side}>
                Snapshot {side.toUpperCase()}
                <select
                  value={(side === 'a' ? left : right)?.id ?? ''}
                  onChange={(e) => (side === 'a' ? setA(e.target.value) : setB(e.target.value))}
                >
                  {snapshots.map((row, i) => (
                    <option key={row.id} value={row.id}>
                      #{i + 1} · {row.label} · {row.description || row.timestamp}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {left && right && left.id !== right.id ? (
            <VectorComparison title="Snapshot comparison" a={left.features} b={right.features} />
          ) : (
            <p>Select two different snapshots.</p>
          )}
        </>
      )}
      <section className="panel inspector-guide">
        <h2>Group means</h2>
        <p>
          Select snapshots into groups A and B above. Each snapshot can belong to one group.
          Consecutive frames from one person are correlated observations, not independent
          participants. Group sizes are capture counts, not participant counts.
        </p>
        {means ? (
          <p>
            Group A: {means.countA} snapshots · Group B: {means.countB} snapshots
          </p>
        ) : (
          <p>Select at least one snapshot in each group.</p>
        )}
      </section>
      {means && <VectorComparison title="Group mean comparison" a={means.a} b={means.b} />}
    </div>
  )
}
