import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExpressionTimeline } from './ExpressionTimeline'
import type { AnalysisSession } from '../../analysis/types'
import { createFaceLandmarker, inferExpression, mapProbabilities } from '@expressionlens/classifier'

vi.mock('@expressionlens/classifier', async (original) => ({
  ...(await original<typeof import('@expressionlens/classifier')>()),
  createFaceLandmarker: vi.fn(),
  inferExpression: vi.fn(),
}))
afterEach(cleanup)
const session: AnalysisSession = {
  id: 'test',
  createdAt: '',
  source: 'upload',
  durationMs: 1000,
  modelVersion: 'v3',
  samplingFps: 5,
  samples: [
    {
      status: 'detected',
      timestampMs: 0,
      ...mapProbabilities([0.8, 0.01, 0.01, 0.18], ['neutral', 'smile', 'surprise', 'angry']),
    },
    {
      status: 'detected',
      timestampMs: 200,
      ...mapProbabilities([0.55, 0.008, 0.002, 0.44], ['neutral', 'smile', 'surprise', 'angry']),
    },
    { status: 'no-face', timestampMs: 400 },
    { status: 'multiple-faces', timestampMs: 600 },
    {
      status: 'detected',
      timestampMs: 800,
      ...mapProbabilities([0.01, 0.8, 0.01, 0.18], ['neutral', 'smile', 'surprise', 'angry']),
    },
  ],
}
it('seeks the existing video, inspects stored probabilities, and navigates events without inference', () => {
  const video = document.createElement('video')
  render(<ExpressionTimeline session={session} videoRef={{ current: video }} />)
  const slider = screen.getByRole('slider', { name: 'Seek video by expression timeline' })
  expect(
    (screen.getByRole('button', { name: 'Previous event' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.change(slider, { target: { value: '299' } })
  expect(video.currentTime).toBe(0.299)
  expect(slider.getAttribute('aria-valuetext')).toContain('00:00.299; Uncertain')
  const details = screen.getByRole('tooltip')
  expect(within(details).getByText('Uncertain')).toBeDefined()
  expect(within(details).getByText('00:00.200')).toBeDefined()
  expect(within(details).getAllByText('Neutral')).toHaveLength(2) // Raw argmax and its distribution label.
  expect(within(details).getAllByRole('progressbar')).toHaveLength(4)
  expect(within(details).getByText(/11.0 percentage points/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Next event' }))
  expect(video.currentTime).toBe(0.4)
  expect(within(details).queryAllByRole('progressbar')).toHaveLength(0)
  expect(within(details).getByText('No face')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Next event' }))
  expect(within(details).getByText('Multiple faces')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Previous event' }))
  expect(video.currentTime).toBe(0.4)
  fireEvent.change(slider, { target: { value: '1000' } })
  expect(video.currentTime).toBe(1)
  expect((screen.getByRole('button', { name: 'Next event' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  expect(createFaceLandmarker).not.toHaveBeenCalled()
  expect(inferExpression).not.toHaveBeenCalled()
})
it('follows native seeking and end and maintains an accessible slider value', () => {
  const video = document.createElement('video')
  render(<ExpressionTimeline session={session} videoRef={{ current: video }} />)
  video.currentTime = 0.65
  fireEvent.seeked(video)
  const slider = screen.getByRole('slider') as HTMLInputElement
  expect(slider.value).toBe('650')
  expect(slider.getAttribute('aria-valuetext')).toContain('Multiple faces')
  expect(screen.getByLabelText('Current video position').textContent).toBe('00:00.650')
  video.currentTime = 1
  fireEvent.ended(video)
  expect(slider.value).toBe('1000')
  video.currentTime = 0
  fireEvent.seeking(video)
  expect(slider.value).toBe('0')
})
it('marks missing observations as unanalysed and uses at most eight SVG paths for thousands of samples', () => {
  const video = document.createElement('video')
  const many: AnalysisSession = {
    ...session,
    durationMs: 400000,
    samples: Array.from({ length: 2000 }, (_, i) => ({
      ...session.samples[i % session.samples.length],
      timestampMs: i * 200,
    })),
  }
  const { container, rerender } = render(
    <ExpressionTimeline session={many} videoRef={{ current: video }} />,
  )
  expect(container.querySelectorAll('svg > path').length).toBeLessThanOrEqual(8)
  rerender(
    <ExpressionTimeline
      key="empty"
      session={{ ...session, samples: [] }}
      videoRef={{ current: video }}
    />,
  )
  fireEvent.focus(screen.getByRole('slider'))
  const details = screen.getByRole('tooltip')
  expect(within(details).getByText('Not analyzed')).toBeDefined()
  expect(within(details).queryAllByRole('progressbar')).toHaveLength(0)
  expect((screen.getByRole('button', { name: 'Next event' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
})

it('shows point-specific details on hover without seeking; hides on leave/Escape and supports focus', () => {
  const video = document.createElement('video')
  render(<ExpressionTimeline session={session} videoRef={{ current: video }} />)
  const slider = screen.getByRole('slider')
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 500,
    bottom: 544,
    width: 220,
    height: 44,
  } as DOMRect)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent(slider, new MouseEvent('pointermove', { bubbles: true, clientX: 170 }))
  expect(screen.getByRole('tooltip').textContent).toContain('Uncertain')
  expect(screen.getByRole('tooltip').textContent).toContain('00:00.300')
  expect(screen.getByRole('tooltip').textContent).toContain('00:00.200')
  expect(video.currentTime).toBe(0)
  fireEvent(slider, new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }))
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.focus(slider)
  expect(screen.getByRole('tooltip').textContent).toContain('Neutral')
  fireEvent.keyDown(slider, { key: 'Escape' })
  expect(screen.queryByRole('tooltip')).toBeNull()
  expect(createFaceLandmarker).not.toHaveBeenCalled()
  expect(inferExpression).not.toHaveBeenCalled()
})
