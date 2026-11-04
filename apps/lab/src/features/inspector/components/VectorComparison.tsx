import { useMemo, useState } from 'react'
import { compareVectors } from '../lib/comparison'

export function VectorComparison({ a, b, title }: { a: number[]; b: number[]; title: string }) {
  const [sort, setSort] = useState('difference')
  const analysis = useMemo(() => compareVectors(a, b), [a, b])
  const rows = useMemo(
    () =>
      [...analysis.rows].sort((x, y) =>
        sort === 'name'
          ? x.name.localeCompare(y.name)
          : (sort === 'a' ? y.a - x.a : sort === 'b' ? y.b - x.b : y.difference - x.difference) ||
            x.name.localeCompare(y.name),
      ),
    [analysis, sort],
  )
  const highlighted = new Set(
    analysis.top.filter((row) => row.difference > 0).map((row) => row.name),
  )
  return (
    <section className="panel inspector-comparison" aria-label={title}>
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      <div className="comparison-body">
        <dl className="inspector-metrics">
          <div>
            <dt>Mean absolute difference</dt>
            <dd>{analysis.meanAbsoluteDifference.toFixed(5)}</dd>
          </div>
          <div>
            <dt>Euclidean distance</dt>
            <dd>{analysis.euclideanDistance.toFixed(5)}</dd>
          </div>
          <div>
            <dt>Cosine similarity</dt>
            <dd>
              {analysis.cosineSimilarity === null
                ? 'Undefined (zero vector)'
                : analysis.cosineSimilarity.toFixed(5)}
            </dd>
          </div>
        </dl>
        <p>
          Descriptive diagnostics, not validated expression similarity measures or evidence of
          classification causes. Highlighted rows have the largest nonzero differences.
        </p>
        <details>
          <summary>Top 10 most different blendshapes</summary>
          <ol>
            {analysis.top.map((row) => (
              <li key={row.name}>
                {row.name}: {row.difference.toFixed(5)}
              </li>
            ))}
          </ol>
        </details>
        <label>
          Sort {title}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="difference">Absolute difference ↓</option>
            <option value="name">Name A–Z</option>
            <option value="a">A activation ↓</option>
            <option value="b">B activation ↓</option>
          </select>
        </label>
        <div className="inspector-table-scroll">
          <table>
            <caption>
              A and B use the same ordered 52-feature schema; bars range from 0 to 1.
            </caption>
            <thead>
              <tr>
                <th>Blendshape</th>
                <th>A</th>
                <th>B</th>
                <th>Absolute difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.name}
                  className={highlighted.has(row.name) ? 'largest-difference' : ''}
                >
                  <th scope="row">{row.name}</th>
                  <td>
                    {row.a.toFixed(4)}
                    <progress aria-label={`${row.name} A`} max={1} value={row.a} />
                  </td>
                  <td>
                    {row.b.toFixed(4)}
                    <progress aria-label={`${row.name} B`} max={1} value={row.b} />
                  </td>
                  <td>{row.difference.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
