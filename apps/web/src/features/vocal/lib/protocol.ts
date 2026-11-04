import type { VocalModelKey } from '../models'
import type { VocalExpressionSample, WindowSeconds } from './core'
export type Request =
  | { type: 'load'; model?: VocalModelKey }
  | { type: 'analyze'; audio: Float32Array; seconds: WindowSeconds; silenceRms: number }
  | { type: 'dispose' }
export type Response =
  | { type: 'progress'; message: string; done?: number; total?: number }
  | {
      type: 'ready'
      loadMs: number
      labels: string[]
      sampleRate: number
      normalize: boolean
      preprocessing?: string
    }
  | {
      type: 'result'
      samples: VocalExpressionSample[]
      inferenceMs: number
      modelPreprocessMs: number
    }
  | { type: 'disposed' }
  | { type: 'error'; message: string }
