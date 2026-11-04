import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { VocalTimeline } from './Timeline'
import type { VocalExpressionSample } from './core'
afterEach(cleanup)
it('synchronizes playback, seeking, pause, skipped windows and end without running a model', () => {
  const ref = createRef<HTMLAudioElement>()
  const samples: VocalExpressionSample[] = [
    {
      startMs: 0,
      endMs: 3000,
      predictedLabel: 'neu',
      scores: { neu: 0.7, hap: 0.3 },
      margin: 0.4,
      status: 'classified',
    },
    {
      startMs: 3000,
      endMs: 6000,
      predictedLabel: null,
      scores: {},
      margin: null,
      status: 'silent',
    },
  ]
  render(
    <>
      <audio ref={ref} />
      <VocalTimeline samples={samples} labels={['neu', 'hap']} mediaRef={ref} mediaKey="file-1" />
    </>,
  )
  const first = screen.getByRole('button', { name: '00:00.000 neu' }),
    second = screen.getByRole('button', { name: '00:03.000 silent' })
  ref.current!.currentTime = 1
  fireEvent.timeUpdate(ref.current!)
  expect(first.getAttribute('aria-current')).toBe('true')
  ref.current!.currentTime = 4
  fireEvent.timeUpdate(ref.current!)
  fireEvent.pause(ref.current!)
  expect(second.getAttribute('aria-current')).toBe('true')
  expect(first.getAttribute('aria-current')).toBeNull()
  fireEvent.click(first)
  expect(ref.current!.currentTime).toBe(0)
  expect(first.getAttribute('aria-current')).toBe('true')
  ref.current!.currentTime = 6
  fireEvent.seeked(ref.current!)
  expect(first.getAttribute('aria-current')).toBeNull()
  expect(second.getAttribute('aria-current')).toBeNull()
})
