export type AnalysisMode =
  'facial' | 'speech' | 'both' | 'vocal' | 'facial-vocal' | 'speech-vocal' | 'all'
export function selectedAnalyses(mode: AnalysisMode) {
  return {
    facial: ['facial', 'both', 'facial-vocal', 'all'].includes(mode),
    speech: ['speech', 'both', 'speech-vocal', 'all'].includes(mode),
    vocal: ['vocal', 'facial-vocal', 'speech-vocal', 'all'].includes(mode),
  }
}
export function modeForSelection(selection: {
  facial: boolean
  speech: boolean
  vocal?: boolean
}): AnalysisMode {
  const modes: AnalysisMode[] = [
    'facial',
    'speech',
    'both',
    'vocal',
    'facial-vocal',
    'speech-vocal',
    'all',
  ]
  return (
    modes.find((mode) => {
      const value = selectedAnalyses(mode)
      return (
        value.facial === selection.facial &&
        value.speech === selection.speech &&
        value.vocal === !!selection.vocal
      )
    }) ?? 'facial'
  )
}
