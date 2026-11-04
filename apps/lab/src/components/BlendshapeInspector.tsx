import { useMemo, useState } from 'react'
import { blendshapeGroup, blendshapeGroups } from '../features/inspector/lib/comparison'
import type { Blendshape } from '../types/face'

const highlighted = new Set([
  'mouthSmileLeft',
  'mouthSmileRight',
  'jawOpen',
  'browInnerUp',
  'browDownLeft',
  'browDownRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
])

export function BlendshapeInspector({
  blendshapes,
  faceDetected,
  showGroups = false,
}: {
  blendshapes: Blendshape[]
  faceDetected: boolean | null
  showGroups?: boolean
}) {
  const [grouped, setGrouped] = useState(showGroups)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('score')
  const filtered = useMemo(
    () =>
      blendshapes
        .filter(({ name }) => name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) =>
          sort === 'name'
            ? a.name.localeCompare(b.name)
            : b.score - a.score || a.name.localeCompare(b.name),
        ),
    [blendshapes, query, sort],
  )
  const displayed = useMemo(
    () =>
      grouped
        ? blendshapeGroups.flatMap((group) =>
            filtered.filter(({ name }) => blendshapeGroup(name) === group),
          )
        : filtered,
    [filtered, grouped],
  )
  return (
    <section className="panel inspector" aria-labelledby="inspector-heading">
      <div className="panel-heading">
        <h2 id="inspector-heading">
          <span className="section-number">03</span> Blendshape inspector
        </h2>
        <span className="coefficient-count">
          {blendshapes.length}
          <span> / 52</span>
        </span>
      </div>
      <div className="inspector-intro">
        <p>The small movements behind every expression.</p>
        <span>
          <i className="highlight-dot" /> Key coefficient
        </span>
      </div>
      <div className="inspector-controls">
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="Filter blendshapes"
            placeholder="Find a blendshape…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="sort">
          <span className="sr-only">Sort blendshapes</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="score">Score ↓</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      {showGroups && (
        <label className="inspector-group-toggle">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />{' '}
          Group by facial region (sort within groups)
        </label>
      )}
      <div className="inspector-columns">
        <span>COEFFICIENT</span>
        <span>SCORE</span>
      </div>
      <div
        className="blendshape-list"
        tabIndex={0}
        role="region"
        aria-label="Blendshape coefficients"
      >
        {blendshapes.length === 0 ? (
          <div className="inspector-empty">
            <span aria-hidden="true">▥</span>
            <h3>{faceDetected === false ? 'No face in view' : 'Waiting for live data'}</h3>
            <p>
              {faceDetected === false
                ? 'Move back into the frame to see current coefficients.'
                : 'Start your camera and face the lens. All 52 coefficients will appear here.'}
            </p>
            <span className="empty-tag">REAL MEASUREMENTS ONLY</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="no-matches">No blendshapes match “{query}”.</div>
        ) : (
          displayed.map(({ name, score }, index) => (
            <div key={name}>
              {grouped &&
                (index === 0 ||
                  blendshapeGroup(displayed[index - 1].name) !== blendshapeGroup(name)) && (
                  <h3 className="blendshape-group-heading">{blendshapeGroup(name)}</h3>
                )}
              <div className={`blendshape-row ${highlighted.has(name) ? 'highlighted' : ''}`}>
                <div className="blendshape-title">
                  <span>
                    {highlighted.has(name) && <i className="highlight-dot" />}
                    {name}
                  </span>
                  <strong>{score.toFixed(3)}</strong>
                </div>
                <progress max={1} value={score} aria-label={name} />
              </div>
            </div>
          ))
        )}
      </div>
      <div className="inspector-footer">
        <span>
          {blendshapes.length
            ? `${filtered.length} of ${blendshapes.length} coefficients`
            : 'No measurements yet'}
        </span>
        <span>RANGE 0 — 1</span>
      </div>
    </section>
  )
}
