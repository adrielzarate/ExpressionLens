import type { NeuralPredictionLabel } from '@expressionlens/classifier'
import type { AnalysisSession } from '../types'

export function sessionStatistics(session: AnalysisSession) {
  const counts: Record<NeuralPredictionLabel, number> = {
    neutral: 0,
    smile: 0,
    surprise: 0,
    angry: 0,
    uncertain: 0,
  }
  let detected = 0,
    noFace = 0,
    multipleFaces = 0
  for (const sample of session.samples) {
    if (sample.status === 'detected') {
      detected++
      counts[sample.label]++
    } else if (sample.status === 'no-face') noFace++
    else multipleFaces++
  }
  return {
    total: session.samples.length,
    detected,
    noFace,
    multipleFaces,
    counts,
    coverage: session.samples.length ? detected / session.samples.length : null,
    distribution: Object.entries(counts).map(([label, count]) => ({
      label,
      count,
      fraction: detected ? count / detected : null,
    })),
  }
}
