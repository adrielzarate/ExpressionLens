import type { Backend, Language } from './core'
export type Request =
  | { type: 'load'; backend: Backend }
  | { type: 'transcribe'; audio: Float32Array; language: Language }
  | { type: 'dispose' }
export type Response =
  | { type: 'progress'; message: string }
  | { type: 'ready'; loadMs: number }
  | { type: 'result'; output: unknown; inferenceMs: number }
  | { type: 'disposed' }
  | { type: 'error'; message: string }
