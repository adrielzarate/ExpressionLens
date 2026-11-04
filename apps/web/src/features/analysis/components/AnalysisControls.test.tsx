import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AnalysisControls } from './AnalysisControls'
import { selectedAnalyses } from '../lib/analysisSelection'
import type { AnalysisMode } from './AnalysisControls'
afterEach(cleanup)
it.each<AnalysisMode>(['facial', 'speech', 'vocal', 'both', 'facial-vocal', 'speech-vocal', 'all'])(
  'offers independent nonempty combination %s',
  (mode) => {
    const change = vi.fn()
    render(
      <AnalysisControls
        mode="facial"
        language="auto"
        disabled={false}
        onModeChange={change}
        onLanguageChange={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Analysis to run'), { target: { value: mode } })
    expect(change).toHaveBeenCalledWith(mode)
    const selection = selectedAnalyses(mode)
    expect(Object.values(selection).some(Boolean)).toBe(true)
    expect(selection.vocal).toBe(['vocal', 'facial-vocal', 'speech-vocal', 'all'].includes(mode))
  },
)
