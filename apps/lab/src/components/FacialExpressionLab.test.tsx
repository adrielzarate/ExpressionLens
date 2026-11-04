import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FacialExpressionLab } from './FacialExpressionLab'
import { useCamera } from '../hooks/useCamera'
import { useFaceLandmarker } from '../hooks/useFaceLandmarker'
import { useClassifierModel } from '../features/comparison/hooks/useClassifierModel'
import { useLiveClassifier } from '../features/comparison/hooks/useLiveClassifier'
import { classifier, frame, pair } from '../features/comparison/test/fixtures'

vi.mock('../hooks/useCamera', () => ({ useCamera: vi.fn() }))
vi.mock('../hooks/useFaceLandmarker', () => ({ useFaceLandmarker: vi.fn() }))
vi.mock('../features/comparison/hooks/useClassifierModel', () => ({ useClassifierModel: vi.fn() }))
vi.mock('../features/comparison/hooks/useLiveClassifier', () => ({ useLiveClassifier: vi.fn() }))
afterEach(cleanup)
function setup(completed = pair()) {
  const newer = frame()
  newer.blendshapes = newer.blendshapes.map((row) => ({
    ...row,
    score: ['jawOpen', 'browInnerUp'].includes(row.name) ? 0.8 : 0,
  }))
  const ref = { current: null }
  vi.mocked(useCamera).mockReturnValue({
    videoRef: ref,
    status: 'live',
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
  })
  vi.mocked(useFaceLandmarker).mockReturnValue({
    status: 'ready',
    error: null,
    snapshot: newer,
    videoDiagnostics: null,
    load: vi.fn(),
    retry: vi.fn(),
  })
  vi.mocked(useClassifierModel).mockReturnValue({
    model: classifier(),
    status: 'ready',
    error: null,
    load: vi.fn(),
    unload: vi.fn(),
  })
  vi.mocked(useLiveClassifier).mockReturnValue({ prediction: completed, error: null })
  return ref
}
it('renders both predictions from the completed shared frame, rather than a newer unrelated detection', () => {
  const ref = setup()
  render(<FacialExpressionLab />)
  expect(screen.getByRole('heading', { name: 'Smile' })).toBeDefined()
  expect(screen.queryByRole('heading', { name: 'Surprise' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'smile' })).toBeDefined()
  expect(useFaceLandmarker).toHaveBeenCalledWith(ref, true, 10, 2)
})

it('tunes only the baseline on the paired frame and captures the current angry prediction', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  const completed = pair(1000)
  const values: Record<string, number> = {
    browDownLeft: 0.8,
    browDownRight: 0.8,
    mouthPressLeft: 0.7,
    mouthPressRight: 0.7,
  }
  completed.frame.blendshapes = completed.frame.blendshapes.map((row) => ({
    ...row,
    score: values[row.name] ?? 0,
  }))
  setup(completed)
  render(<FacialExpressionLab />)
  expect(screen.getByRole('heading', { name: 'Angry' })).toBeDefined()
  expect(screen.getByRole('heading', { name: 'smile' })).toBeDefined()
  fireEvent.click(screen.getByLabelText('Manual evaluation'))
  fireEvent.change(screen.getByLabelText('Intended expression'), { target: { value: 'angry' } })
  fireEvent.click(screen.getByRole('button', { name: 'Capture evaluation sample' }))
  const evaluation = screen.getByRole('region', { name: 'Manual expression evaluation' })
  expect(within(evaluation).getByRole('cell', { name: 'angry ✓' })).toBeDefined()

  fireEvent.click(screen.getByText('Heuristic debugging & thresholds'))
  fireEvent.click(screen.getByText('Tune thresholds (this lab session)'))
  fireEvent.change(screen.getByLabelText('Angry brow down minimum'), { target: { value: '0.9' } })
  expect(screen.getByRole('heading', { name: 'Neutral' })).toBeDefined()
  expect(screen.getByRole('heading', { name: 'smile' })).toBeDefined()
  // No heuristic settings are passed into the neural inference hook.
  expect(vi.mocked(useLiveClassifier).mock.calls.at(-1)).toHaveLength(5)
  expect(completed.primary.distribution.map((row) => row.probability)).toEqual([0.1, 0.7, 0.1, 0.1])
  fireEvent.click(screen.getByRole('button', { name: 'Reset heuristic thresholds' }))
  expect(screen.getByRole('heading', { name: 'Angry' })).toBeDefined()
})
