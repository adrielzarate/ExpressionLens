import type { AnalysisSession } from '../types'
export function hasAnalysisIssues(session: AnalysisSession | null) {
  if (!session) return false
  return !!(
    session.facialError ||
    session.transcription?.error ||
    session.vocal?.error ||
    [session.facialStatus, session.transcription?.status, session.vocal?.status].some(
      (status) => status === 'error' || status === 'cancelled' || status === 'partial',
    )
  )
}
