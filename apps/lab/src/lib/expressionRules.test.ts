import { describe, expect, it } from 'vitest'
import {
  classifyExpression,
  defaultThresholds,
  evaluateExpression,
  expressionInputs,
} from './expressionRules'

type Values = Partial<Record<(typeof expressionInputs)[number], number>>
const shapes = (values: Values = {}) =>
  expressionInputs.map((name) => ({ name, score: values[name] ?? 0 }))
const smile: Values = { mouthSmileLeft: 0.9, mouthSmileRight: 0.9 }
const furrow: Values = { browDownLeft: 0.8, browDownRight: 0.8 }
const squint: Values = { eyeSquintLeft: 0.65, eyeSquintRight: 0.65 }
const stretch: Values = { mouthStretchLeft: 0.8, mouthStretchRight: 0.8 }
const press: Values = { mouthPressLeft: 0.7, mouthPressRight: 0.7 }
const grit: Values = { ...furrow, ...squint, ...stretch, jawOpen: 0.35 }
const label = (values: Values) => classifyExpression(shapes(values))?.label

describe('experimental four-way movement rules', () => {
  it('requires complete, finite measurements within the coefficient range', () => {
    expect(classifyExpression([])).toBeNull()
    expect(classifyExpression(shapes().slice(1))).toBeNull()
    for (const invalid of [NaN, Infinity, -0.1, 1.1]) {
      expect(classifyExpression(shapes({ browDownLeft: invalid }))).toBeNull()
    }
  })
  it('preserves a neutral fallback for low activation', () => {
    expect(label({})).toBe('Neutral')
    expect(label({ mouthSmileLeft: 0.2, jawOpen: 0.1, browDownLeft: 0.1 })).toBe('Neutral')
  })
  it('requires both smile corners, including their threshold boundary', () => {
    expect(label({ mouthSmileLeft: 0.45, mouthSmileRight: 0.45 })).toBe('Smile')
    expect(label({ mouthSmileLeft: 0.9, mouthSmileRight: 0.1 })).toBe('Neutral')
    expect(label(smile)).toBe('Smile')
  })
  it('requires jaw AND inner brow raising for surprise, preserving inclusive boundaries', () => {
    expect(label({ jawOpen: 0.45, browInnerUp: 0.25 })).toBe('Surprise')
    expect(label({ jawOpen: 0.9, browInnerUp: 0.1 })).toBe('Neutral')
    expect(label({ jawOpen: 0.1, browInnerUp: 0.9 })).toBe('Neutral')
  })
  it('supports furrowed eyebrows with closed lips and lip press', () => {
    expect(label({ ...furrow, ...press, jawOpen: 0.05 })).toBe('Angry')
  })
  it('supports closed lips and furrow/squint even without strong mouth press', () => {
    expect(label({ ...furrow, ...squint })).toBe('Angry')
  })
  it('uses bilateral mouth frown as an alternative tension cue', () => {
    expect(label({ ...furrow, mouthFrownLeft: 0.6, mouthFrownRight: 0.7 })).toBe('Angry')
  })
  it('supports clenched mouth patterns with visible-teeth-like stretch', () => {
    expect(label(grit)).toBe('Angry')
    expect(evaluateExpression(shapes(grit))?.angryPattern).toBe('clenched mouth')
  })
  it('distinguishes an angry stretched mouth from a smiling stretched mouth', () => {
    // The coefficients do not directly measure visible teeth; these fixtures model
    // the accompanying movements. Only the smiling fixture has lifted corners.
    expect(label({ ...grit, mouthSmileLeft: 0.55, mouthSmileRight: 0.55 })).toBe('Angry')
    expect(label({ ...smile, ...squint, ...stretch, jawOpen: 0.35 })).toBe('Smile')
  })
  it.each<Values>([stretch, squint, press, furrow, { jawOpen: 0.35, ...stretch }])(
    'does not treat an isolated cue as smile or angry: %j',
    (values) => {
      expect(label(values)).toBe('Neutral')
    },
  )
  it('does not use asymmetric brow or mouth tension as bilateral angry evidence', () => {
    expect(label({ ...press, browDownLeft: 0.9, browDownRight: 0.1 })).toBe('Neutral')
    expect(label({ ...furrow, mouthPressLeft: 0.9, mouthPressRight: 0.1 })).toBe('Neutral')
  })
  it('does not confuse wide-open surprise with a clenched jaw', () => {
    expect(label({ ...grit, jawOpen: 0.9, browInnerUp: 0.9 })).toBe('Surprise')
  })
  it('uses comparable scores instead of fixed priority between smile and surprise', () => {
    expect(label({ ...smile, jawOpen: 0.45, browInnerUp: 0.25 })).toBe('Smile')
    expect(
      label({ mouthSmileLeft: 0.45, mouthSmileRight: 0.45, jawOpen: 0.9, browInnerUp: 0.9 }),
    ).toBe('Surprise')
  })
  it('lets strong smile beat weak angry evidence and strong angry beat weak smile', () => {
    expect(label({ ...smile, browDownLeft: 0.3, browDownRight: 0.3, ...press })).toBe('Smile')
    expect(label({ ...grit, mouthSmileLeft: 0.45, mouthSmileRight: 0.45 })).toBe('Angry')
  })
  it('abstains to Neutral for tied or near-tied competing patterns', () => {
    const result = evaluateExpression(
      shapes({ mouthSmileLeft: 0.45, mouthSmileRight: 0.45, jawOpen: 0.45, browInnerUp: 0.25 }),
    )!
    expect(result.expression.label).toBe('Neutral')
    expect(result.ambiguous).toBe(true)
    expect(result.scores.Smile).toBe(result.scores.Surprise)
  })
  it('supports partial configuration without changing defaults', () => {
    expect(
      classifyExpression(shapes({ mouthSmileLeft: 0.2, mouthSmileRight: 0.2 }), { smileMin: 0.2 })
        ?.label,
    ).toBe('Smile')
    expect(classifyExpression(shapes(grit), { angryBrowMin: 0.9 })?.label).toBe('Neutral')
    expect(defaultThresholds.angryBrowMin).toBe(0.3)
  })
  it('rejects invalid settings and keeps debugging scores bounded', () => {
    expect(classifyExpression(shapes(smile), { smileMin: NaN })).toBeNull()
    expect(classifyExpression(shapes(smile), { angryClosedJawMax: 2 })).toBeNull()
    const scores = evaluateExpression(shapes(grit))!.scores
    expect(Object.keys(scores)).toEqual(['Neutral', 'Smile', 'Surprise', 'Angry'])
    expect(Object.values(scores).every((score) => score >= 0 && score <= 1)).toBe(true)
  })
})
