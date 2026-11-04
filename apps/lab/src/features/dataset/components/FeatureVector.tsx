import { featureNames } from '../lib/featureSchema'

export function FeatureVector({ features }: { features: readonly number[] }) {
  return (
    <dl className="feature-vector">
      {featureNames.map((name, index) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>
            {features[index].toFixed(3)}
            <progress max={1} value={features[index]} aria-label={name} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
