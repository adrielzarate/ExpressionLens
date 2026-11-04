import { defaultThresholds, expressionCategories, expressionInputs } from '../lib/expressionRules'
import type { ExpressionThresholds, HeuristicAnalysis } from '../lib/expressionRules'
import type { Blendshape } from '../types/face'
import './heuristicDebug.css'

const thresholdLabels: Record<keyof ExpressionThresholds, string> = {
  smileMin: 'Smile corners minimum',
  surpriseJawMin: 'Surprise jaw minimum',
  surpriseBrowMin: 'Surprise inner brow minimum',
  angryBrowMin: 'Angry brow down minimum',
  angrySquintMin: 'Angry eye squint minimum',
  angryPressMin: 'Angry mouth press minimum',
  angryStretchMin: 'Angry mouth stretch minimum',
  angryFrownMin: 'Angry mouth frown minimum',
  angryClosedJawMax: 'Closed lips jaw maximum',
  angryClenchJawMax: 'Clenched mouth jaw maximum',
  ambiguityMargin: 'Ambiguous score margin',
}
export function HeuristicDebug({
  blendshapes,
  analysis,
  thresholds,
  onChange,
}: {
  blendshapes: Blendshape[]
  analysis: HeuristicAnalysis | null
  thresholds: ExpressionThresholds
  onChange?: (thresholds: ExpressionThresholds) => void
}) {
  return (
    <details className="rules heuristic-debug">
      <summary>Heuristic debugging &amp; thresholds</summary>
      <p>
        Four competing movement scores, not probabilities. No class has fixed priority. Near ties
        use the Neutral fallback; Neutral does not prove a relaxed face.
      </p>
      <div className="heuristic-scores">
        {expressionCategories.map((label) => (
          <div key={label}>
            <span>{label}</span>
            <meter
              aria-label={`${label} heuristic score`}
              min={0}
              max={1}
              value={analysis?.scores[label] ?? 0}
            />
            <output>{analysis?.scores[label].toFixed(3) ?? '—'}</output>
          </div>
        ))}
      </div>
      <p>
        {!analysis
          ? 'Waiting for complete measurements.'
          : analysis.ambiguous
            ? 'Ambiguous competing patterns → Neutral fallback.'
            : `Selected pattern: ${analysis.expression.label}.`}
        {analysis?.angryPattern && ` Angry evidence: ${analysis.angryPattern}.`}
      </p>
      <p>
        Smile needs both smile corners. Surprise needs jaw opening and inner brow raising. Angry
        needs both brows down plus bilateral squint, lip press or mouth frown with a closed jaw; an
        open clenched mouth also needs bilateral stretch. Stretch alone proves neither a smile nor
        anger. Teeth visibility is not measured directly.
      </p>
      <details>
        <summary>Relevant blendshape values</summary>
        <div className="expression-inputs">
          {expressionInputs.map((name) => (
            <div key={name}>
              <span>{name}</span>
              <strong>{blendshapes.find((s) => s.name === name)?.score.toFixed(3) ?? '—'}</strong>
            </div>
          ))}
        </div>
      </details>
      {onChange && (
        <details>
          <summary>Tune thresholds (this lab session)</summary>
          <div className="heuristic-thresholds">
            {(Object.keys(defaultThresholds) as (keyof ExpressionThresholds)[]).map((key) => (
              <label key={key}>
                {thresholdLabels[key]}
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={thresholds[key]}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber
                    if (Number.isFinite(value) && value >= 0 && value <= 1)
                      onChange({ ...thresholds, [key]: value })
                  }}
                />
              </label>
            ))}
          </div>
          <button className="text-button" onClick={() => onChange({ ...defaultThresholds })}>
            Reset heuristic thresholds
          </button>
        </details>
      )}
      <p>
        Experimental baseline: these thresholds are tunable hypotheses, not scientifically validated
        emotion detection rules. Adjusting them does not change the neural classifier.
      </p>
    </details>
  )
}
