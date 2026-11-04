import type { Backend, Language, TranscriptSegment } from './lib/core'
export type { Language, TranscriptSegment }
export interface SessionTranscription {
  status: 'not-requested' | 'completed' | 'error' | 'cancelled'
  selectedLanguage: Language
  detectedLanguage: string | null
  text: string
  segments: TranscriptSegment[]
  timestampWarning?: string
  error?: string
  metadata?: {
    modelId: string
    backend: Backend
    inferenceMs: number
    loadMs: number
    audioDurationMs: number
  }
}
export const emptyTranscription = (selectedLanguage: Language = 'auto'): SessionTranscription => ({
  status: 'not-requested',
  selectedLanguage,
  detectedLanguage: null,
  text: '',
  segments: [],
})
