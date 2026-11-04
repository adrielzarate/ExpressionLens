import type { ProbabilityPrediction } from '@expressionlens/classifier'

export type ExpressionSample =
  | (ProbabilityPrediction & { status: 'detected'; timestampMs: number })
  | { status: 'no-face' | 'multiple-faces'; timestampMs: number }

export interface AnalysisSession {
  id: string
  createdAt: string
  source: 'upload' | 'live'
  durationMs: number
  modelVersion: string
  samplingFps: number
  samples: ExpressionSample[]
  // Optional only for legacy in-memory producers; imports/new workflows normalize these.
  facialStatus?: 'not-requested' | 'completed' | 'error' | 'cancelled'
  facialError?: string
  transcription?: import('../speech/types').SessionTranscription
  vocal?: import('../vocal/types').SessionVocal
  selectedAnalyses?: { facial: boolean; speech: boolean; vocal: boolean }
  video?: SessionVideoMetadata
}
export interface VideoMetadata {
  durationMs: number
  width: number
  height: number
}
export interface AnalysisProgress {
  processedFrames: number
  totalFrames: number
  timestampMs: number
}
export type AnalysisStatus = 'idle' | 'loading' | 'analyzing' | 'completed' | 'cancelled' | 'error'

export interface SessionVideoMetadata extends VideoMetadata {
  filename: string
  sizeBytes: number
  mimeType?: string
}

export interface AnalysisOptions {
  facial: boolean
  speech: boolean
  vocal?: boolean
  language: import('../speech/types').Language
  file: File
}
