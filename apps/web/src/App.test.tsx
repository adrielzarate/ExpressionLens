import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { analyzeVideo } from './features/analysis/lib/analyzeVideo'

vi.mock('./features/analysis/lib/analyzeVideo', () => ({ analyzeVideo: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('offers local upload and an explicit recording entry without exposing Lab tools', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Your interview video' })).toBeDefined()
  expect(
    screen.queryByText(
      /Dataset Collector|Classifier Training|Blendshape Inspector|Facial Expression Lab/,
    ),
  ).toBeNull()
  expect(screen.getByRole('button', { name: 'Record Video' })).toBeDefined()
  expect(screen.queryByRole('button', { name: 'Analyze video' })).toBeNull()
  expect(analyzeVideo).not.toHaveBeenCalled()
})
it('shows metadata and independent native preview controls, and requires readable metadata before analysis', () => {
  const revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:clip')
      static revokeObjectURL = revoke
    },
  )
  render(<App />)
  fireEvent.change(screen.getByLabelText('Choose a video'), {
    target: { files: [new File(['video'], 'clip.mp4', { type: 'video/mp4' })] },
  })
  const video = screen.getByLabelText('Selected video preview') as HTMLVideoElement
  expect(video.controls).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Analyze video' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  Object.defineProperties(video, {
    duration: { value: 2 },
    videoWidth: { value: 1280 },
    videoHeight: { value: 720 },
  })
  fireEvent.loadedMetadata(video)
  expect(screen.getByText('1280 × 720')).toBeDefined()
  expect(screen.getByText('0:02.0')).toBeDefined()
  expect(
    (screen.getByRole('button', { name: 'Analyze video' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  expect(analyzeVideo).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Remove video' }))
  expect(revoke).toHaveBeenCalledWith('blob:clip')
  expect(screen.queryByLabelText('Selected video preview')).toBeNull()
})

it('connects completed analysis to the same native preview and never re-analyzes on timeline/native seeks', async () => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:timeline')
      static revokeObjectURL = vi.fn()
    },
  )
  const base = {
    status: 'detected' as const,
    rawLabel: 'neutral' as const,
    confidence: 0.55,
    margin: 0.11,
    distribution: [
      { label: 'neutral' as const, probability: 0.55 },
      { label: 'smile' as const, probability: 0.008 },
      { label: 'surprise' as const, probability: 0.002 },
      { label: 'angry' as const, probability: 0.44 },
    ],
  }
  vi.mocked(analyzeVideo).mockResolvedValueOnce({
    id: 'timeline-session',
    createdAt: '',
    source: 'upload',
    durationMs: 400,
    samplingFps: 5,
    modelVersion: 'v3',
    samples: [
      { ...base, timestampMs: 0, label: 'uncertain', isUncertain: true },
      { status: 'no-face', timestampMs: 200 },
    ],
  })
  render(<App />)
  fireEvent.change(screen.getByLabelText('Choose a video'), {
    target: { files: [new File(['video'], 'clip.mp4', { type: 'video/mp4' })] },
  })
  const video = screen.getByLabelText('Selected video preview') as HTMLVideoElement
  Object.defineProperties(video, {
    duration: { value: 0.4 },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  })
  fireEvent.loadedMetadata(video)
  fireEvent.click(screen.getByRole('button', { name: 'Analyze video' }))
  await screen.findByRole('heading', { name: 'Expression timeline' })
  expect(screen.getByRole('heading', { name: 'Your analysis summary' })).toBeDefined()
  fireEvent.change(screen.getByRole('slider'), { target: { value: '250' } })
  const details = screen.getByRole('tooltip')
  expect(video.currentTime).toBe(0.25)
  expect(within(details).getByText('No face')).toBeDefined()
  video.currentTime = 0.1
  fireEvent.seeked(video)
  fireEvent.focus(screen.getByRole('slider'))
  expect(within(details).getByText('Uncertain')).toBeDefined()
  expect(within(details).getByText('00:00.000')).toBeDefined()
  expect(analyzeVideo).toHaveBeenCalledOnce()
})
