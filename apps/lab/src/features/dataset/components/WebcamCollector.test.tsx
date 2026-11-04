import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WebcamCollector } from './WebcamCollector'
import { useCamera } from '../../../hooks/useCamera'
import { useFaceLandmarker } from '../../../hooks/useFaceLandmarker'
import { emptySnapshot } from '../../../types/face'
import { featureNames } from '../lib/featureSchema'

vi.mock('../../../hooks/useCamera', () => ({ useCamera: vi.fn() }))
vi.mock('../../../hooks/useFaceLandmarker', () => ({ useFaceLandmarker: vi.fn() }))
const camera = vi.mocked(useCamera)
const analysis = vi.mocked(useFaceLandmarker)
const stop = vi.fn()
let result: ReturnType<typeof useFaceLandmarker>

beforeEach(() => {
  vi.useFakeTimers()
  stop.mockReset()
  camera.mockReturnValue({
    videoRef: { current: null },
    status: 'live',
    error: null,
    start: vi.fn(),
    stop,
    resume: vi.fn(),
  })
  result = {
    status: 'ready',
    error: null,
    snapshot: emptySnapshot(),
    videoDiagnostics: null,
    load: vi.fn(),
    retry: vi.fn(),
  }
  analysis.mockImplementation(() => result)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('counts down, captures only one-face snapshots, stops the camera, and requires Save', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onActivity = vi.fn()
  const { rerender } = render(
    <WebcamCollector disabled={false} onActivity={onActivity} onSave={onSave} />,
  )
  fireEvent.change(screen.getByLabelText('Participant ID'), { target: { value: 'person-mobile' } })
  fireEvent.change(screen.getByLabelText('Capture duration'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Start countdown' }))
  expect(screen.getByText(/Get ready: 3/)).toBeDefined()
  expect(onActivity).toHaveBeenLastCalledWith(true)
  expect(onSave).not.toHaveBeenCalled()
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  const publish = (faceCount: number) => {
    act(() => {
      vi.advanceTimersByTime(200)
    })
    result = {
      ...result,
      snapshot: {
        ...emptySnapshot(),
        faceCount,
        faceDetected: true,
        timestampMs: performance.now(),
        blendshapes: featureNames.map((name) => ({ name, score: 0.5 })),
      },
    }
    rerender(<WebcamCollector disabled={false} onActivity={onActivity} onSave={onSave} />)
  }
  publish(2)
  publish(1)
  expect(onSave).not.toHaveBeenCalled()
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(screen.getByText('1 samples ready for review. Not saved yet.')).toBeDefined()
  expect(stop).toHaveBeenCalled()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 samples' }))
  })
  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave.mock.calls[0][0][0]).toMatchObject({
    participantId: 'person-mobile',
    label: 'neutral',
    source: 'real',
  })
  expect(onSave.mock.calls[0][0][0].features).toHaveLength(52)
  expect(onActivity).toHaveBeenLastCalledWith(false)
  expect(analysis).toHaveBeenCalledWith(expect.anything(), true, 5, 2)
})
it('allows discarding an interrupted capture without persisting it', () => {
  const onSave = vi.fn()
  const onActivity = vi.fn()
  render(<WebcamCollector disabled={false} onActivity={onActivity} onSave={onSave} />)
  fireEvent.change(screen.getByLabelText('Participant ID'), { target: { value: 'person-mobile' } })
  fireEvent.click(screen.getByRole('button', { name: 'Start countdown' }))
  fireEvent.click(screen.getByRole('button', { name: 'End capture' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard capture' }))
  expect(onSave).not.toHaveBeenCalled()
  expect(onActivity).toHaveBeenLastCalledWith(false)
})
