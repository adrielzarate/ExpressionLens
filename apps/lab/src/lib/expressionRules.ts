import type { Blendshape } from '../types/face'

// Tunable movement hypotheses, not scientifically validated emotion rules.
export const defaultThresholds = {
  smileMin: 0.45,
  surpriseJawMin: 0.45,
  surpriseBrowMin: 0.25,
  angryBrowMin: 0.3,
  angrySquintMin: 0.2,
  angryPressMin: 0.2,
  angryStretchMin: 0.25,
  angryFrownMin: 0.2,
  angryClosedJawMax: 0.25,
  angryClenchJawMax: 0.55,
  ambiguityMargin: 0.03,
} as const
export type ExpressionThresholds = { -readonly [K in keyof typeof defaultThresholds]: number }
export const expressionInputs = [
  'mouthSmileLeft',
  'mouthSmileRight',
  'jawOpen',
  'browInnerUp',
  'browDownLeft',
  'browDownRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthFrownLeft',
  'mouthFrownRight',
] as const
export const expressionCategories = ['Neutral', 'Smile', 'Surprise', 'Angry'] as const
export interface Expression {
  label: (typeof expressionCategories)[number]
  emoji: string
}
export type HeuristicScores = Record<Expression['label'], number>
export interface HeuristicAnalysis {
  expression: Expression
  scores: HeuristicScores
  ambiguous: boolean
  angryPattern: 'closed lips' | 'clenched mouth' | null
}
const emojis: Record<Expression['label'], string> = {
  Neutral: '😐',
  Smile: '🙂',
  Surprise: '😮',
  Angry: '😠',
}

export function evaluateExpression(
  blendshapes: Blendshape[],
  overrides: Partial<ExpressionThresholds> = {},
): HeuristicAnalysis | null {
  const t = { ...defaultThresholds, ...overrides }
  if (Object.values(t).some((v) => !Number.isFinite(v) || v < 0 || v > 1)) return null
  const values = new Map(blendshapes.map(({ name, score }) => [name, score]))
  // Missing/invalid measurements must never be fabricated as zeros.
  if (
    expressionInputs.some((name) => {
      const value = values.get(name)
      return value === undefined || !Number.isFinite(value) || value < 0 || value > 1
    })
  )
    return null
  const v = (name: (typeof expressionInputs)[number]) => values.get(name)!
  const both = (
    left: (typeof expressionInputs)[number],
    right: (typeof expressionInputs)[number],
  ) => Math.min(v(left), v(right))
  // Each gate scores 0 below threshold, 0.5 at threshold, rising to 1 above it.
  // A threshold of 1 accepts only full activation, conservatively scoring 0.5.
  const evidence = (value: number, threshold: number) =>
    value < threshold
      ? 0
      : 0.5 + 0.5 * (threshold === 1 ? 0 : (value - threshold) / (1 - threshold))
  const smile = evidence(both('mouthSmileLeft', 'mouthSmileRight'), t.smileMin)
  const surprise = Math.min(
    evidence(v('jawOpen'), t.surpriseJawMin),
    evidence(v('browInnerUp'), t.surpriseBrowMin),
  )
  const brow = evidence(both('browDownLeft', 'browDownRight'), t.angryBrowMin)
  const tension = Math.max(
    evidence(both('eyeSquintLeft', 'eyeSquintRight'), t.angrySquintMin),
    evidence(both('mouthPressLeft', 'mouthPressRight'), t.angryPressMin),
    evidence(both('mouthFrownLeft', 'mouthFrownRight'), t.angryFrownMin),
  )
  // Closed lips: furrow + squint/press/frown; clenched mouth additionally needs stretch.
  // MediaPipe has no teeth-visibility coefficient. Stretch is a proxy for mouth tension,
  // never evidence of smiling and never sufficient for angry on its own.
  const closed = v('jawOpen') <= t.angryClosedJawMax ? Math.min(brow, tension) : 0
  const clenched =
    v('jawOpen') <= t.angryClenchJawMax
      ? Math.min(
          brow,
          tension,
          evidence(both('mouthStretchLeft', 'mouthStretchRight'), t.angryStretchMin),
        )
      : 0
  const angry = Math.max(closed, clenched)
  const strongest = Math.max(smile, surprise, angry)
  const scores: HeuristicScores = {
    Neutral: strongest === 0 ? 1 : 0,
    Smile: smile,
    Surprise: surprise,
    Angry: angry,
  }
  const ranked = expressionCategories
    .map((label) => ({ label, score: scores[label] }))
    .sort((a, b) => b.score - a.score)
  // No class priority: near ties abstain to the neutral fallback.
  const ambiguous =
    ranked[0].label !== 'Neutral' &&
    ranked[1].score > 0 &&
    ranked[0].score - ranked[1].score <= t.ambiguityMargin
  const label = ambiguous ? 'Neutral' : ranked[0].label
  return {
    expression: { label, emoji: emojis[label] },
    scores,
    ambiguous,
    angryPattern: angry === 0 ? null : closed >= clenched ? 'closed lips' : 'clenched mouth',
  }
}
export function classifyExpression(
  blendshapes: Blendshape[],
  thresholds: Partial<ExpressionThresholds> = {},
): Expression | null {
  return evaluateExpression(blendshapes, thresholds)?.expression ?? null
}
