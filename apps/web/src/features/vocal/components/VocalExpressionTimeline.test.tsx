import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { VocalExpressionTimeline } from './VocalExpressionTimeline'
import { vocalFixture } from '../test/fixtures'
afterEach(cleanup)
it('follows actual media playback, seeking and paused time, distinguishes unclassified windows and seeks on click', () => {
  const video = document.createElement('video'),
    vocal = vocalFixture()
  render(
    <VocalExpressionTimeline
      vocal={vocal}
      durationMs={1500}
      videoRef={{ current: video }}
      videoConnected
    />,
  )
  video.currentTime = 0.25
  fireEvent.timeUpdate(video)
  expect(screen.getByTestId('active-vocal-interval').getAttribute('x')).toBe('0')
  expect(screen.getByLabelText('Vocal window details').textContent).toContain(
    'Happy / excited (hap)',
  )
  video.currentTime = 0.75
  fireEvent.seeked(video)
  fireEvent.pause(video)
  expect(screen.getByLabelText('Vocal window details').textContent).toContain(
    'Unclassified · silence gate',
  )
  expect(screen.getByTestId('active-vocal-interval').getAttribute('x')).toBe(
    String((500 / 1500) * 1000),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Seek to vocal window start' }))
  expect(video.currentTime).toBe(0.5)
  fireEvent.blur(screen.getByRole('slider'))
  video.currentTime = 1.2
  fireEvent.seeked(video)
  expect(screen.queryByTestId('active-vocal-interval')).toBeNull()
  expect(screen.getByText('No vocal window at this timestamp.')).toBeDefined()
  fireEvent.change(screen.getByRole('slider'), { target: { value: '250' } })
  expect(video.currentTime).toBe(0.25)
  expect(screen.getByLabelText('hap vocal score')).toBeDefined()
})
it('restores imported results without requiring a connected video and keeps the DOM compact', () => {
  const vocal = vocalFixture()
  const sample = vocal.samples[0]
  vocal.samples = Array.from({ length: 1000 }, (_, i) => ({
    ...sample,
    startMs: i * 500,
    endMs: (i + 1) * 500,
  }))
  const { container } = render(
    <VocalExpressionTimeline
      vocal={vocal}
      durationMs={500000}
      videoRef={{ current: null }}
      videoConnected={false}
    />,
  )
  expect(container.querySelectorAll('path').length).toBeLessThan(10)
  fireEvent.change(screen.getByRole('slider'), { target: { value: '250' } })
  expect(screen.getByLabelText('Vocal window details').textContent).toContain('Happy / excited')
  expect(
    (screen.getByRole('button', { name: 'Seek to vocal window start' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
})
it('renders all nine Emotion2vec labels and colors while resolving historical Wav2Vec2 sessions independently', async () => {
  const { emotionVocalFixture } = await import('../test/fixtures')
  const video = document.createElement('video')
  const { rerender, container } = render(
    <VocalExpressionTimeline
      vocal={emotionVocalFixture()}
      durationMs={1000}
      videoRef={{ current: video }}
      videoConnected
    />,
  )
  for (const label of [
    'angry',
    'disgusted',
    'fearful',
    'happy',
    'neutral',
    'other',
    'sad',
    'surprised',
    'unknown',
  ])
    expect(screen.getByLabelText(`${label} vocal score`)).toBeDefined()
  expect(screen.queryByLabelText('hap vocal score')).toBeNull()
  expect(screen.getByText(/Experimental acoustic categories from Emotion2vec\+ Base/)).toBeDefined()
  expect(container.querySelector('svg path:nth-child(2)')?.getAttribute('fill')).not.toBe('#eceeeb')
  rerender(
    <VocalExpressionTimeline
      vocal={vocalFixture()}
      durationMs={1000}
      videoRef={{ current: video }}
      videoConnected
    />,
  )
  expect(screen.getByLabelText('hap vocal score')).toBeDefined()
  expect(screen.queryByLabelText('angry vocal score')).toBeNull()
  expect(screen.getByText(/Experimental acoustic categories from Wav2Vec2 SUPERB ER/)).toBeDefined()
})
