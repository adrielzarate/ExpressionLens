import type { VocalDtype } from './models'
import type { VocalExpressionSample } from './lib/core'
export type { VocalExpressionSample } from './lib/core'
// Historical Wav2Vec2 class order retained for compatibility; not the active model mapping.
export const VOCAL_LABELS = ['neu', 'hap', 'ang', 'sad'] as const
export interface SessionVocal {
  status: 'not-requested' | 'completed' | 'partial' | 'error' | 'cancelled'
  samples: VocalExpressionSample[]
  error?: string
  metadata?: {
    modelId: string
    revision: string
    dtype: VocalDtype
    preprocessing?: string
    backend: 'wasm'
    labels: string[]
    sampleRate: 16000
    windowSeconds: 3 | 5 | 10
    stepMs: number
    overlapMs: 0
    silenceRms: number
    audioDurationMs: number
    loadMs: number
    inferenceMs: number
  }
}
export const emptyVocal = (): SessionVocal => ({ status: 'not-requested', samples: [] })
