import type { Language } from '../../speech/types'
import { selectedAnalyses } from '../lib/analysisSelection'
import type { AnalysisMode } from '../lib/analysisSelection'
export type { AnalysisMode } from '../lib/analysisSelection'
export function AnalysisControls({
  mode,
  language,
  disabled,
  onModeChange,
  onLanguageChange,
}: {
  mode: AnalysisMode
  language: Language
  disabled: boolean
  onModeChange(value: AnalysisMode): void
  onLanguageChange(value: Language): void
}) {
  return (
    <div className="analysis-choice">
      <label>
        Analysis to run
        <select
          value={mode}
          disabled={disabled}
          onChange={(event) => onModeChange(event.target.value as AnalysisMode)}
        >
          <option value="facial">Facial expressions</option>
          <option value="speech">Speech transcriptions</option>
          <option value="both">Facial expressions + Speech transcriptions</option>
          <option value="vocal">Vocal expressions</option>
          <option value="facial-vocal">Facial expressions + Vocal expressions</option>
          <option value="speech-vocal">Speech transcriptions + Vocal expressions</option>
          <option value="all">
            Facial expressions + Speech transcriptions + Vocal expressions
          </option>
        </select>
      </label>
      <label>
        Transcription language
        <select
          value={language}
          disabled={disabled || !selectedAnalyses(mode).speech}
          onChange={(event) => onLanguageChange(event.target.value as Language)}
        >
          <option value="auto">Auto</option>
          <option value="english">English</option>
          <option value="spanish">Spanish</option>
        </select>
      </label>
    </div>
  )
}
