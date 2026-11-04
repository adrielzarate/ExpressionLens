import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createRef } from 'react'
import { TranscriptTimeline } from './TranscriptTimeline'
import { ExpressionTimeline } from '../../timeline/components/ExpressionTimeline'
import { sessionFixture } from '../../sessions/test/fixtures'
import type { SessionTranscription } from '../types'
const transcription: SessionTranscription = {
  status: 'completed',
  selectedLanguage: 'english',
  detectedLanguage: null,
  text: 'Hello world',
  segments: [
    { startMs: 100, endMs: 400, text: 'Hello' },
    { startMs: 600, endMs: 900, text: 'world' },
  ],
}
afterEach(cleanup)
it('seeks the same video from speech and expression timelines and clears active speech in gaps', () => {
  const ref = createRef<HTMLVideoElement>()
  render(
    <>
      <video ref={ref} />
      <ExpressionTimeline session={sessionFixture()} videoRef={ref} />
      <TranscriptTimeline transcription={transcription} videoRef={ref} videoConnected />
    </>,
  )
  const hello = screen.getByRole('button', { name: /Hello/ }),
    world = screen.getByRole('button', { name: /world/ })
  fireEvent.click(world)
  expect(ref.current?.currentTime).toBe(0.6)
  fireEvent.seeked(ref.current!)
  expect(world.getAttribute('aria-current')).toBe('true')
  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('600')
  fireEvent.change(screen.getByRole('slider'), { target: { value: '200' } })
  fireEvent.seeked(ref.current!)
  expect(hello.getAttribute('aria-current')).toBe('true')
  act(() => {
    ref.current!.currentTime = 0.5
    fireEvent.timeUpdate(ref.current!)
  })
  expect(hello.getAttribute('aria-current')).toBeNull()
  expect(world.getAttribute('aria-current')).toBeNull()
})
it('restores transcript without video, disabling seeking until reattachment', () => {
  render(
    <TranscriptTimeline
      transcription={transcription}
      videoRef={createRef<HTMLVideoElement>()}
      videoConnected={false}
    />,
  )
  expect((screen.getByRole('button', { name: /Hello/ }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/Select the original video/)).toBeDefined()
})

it('follows normal playback media events, segment transitions, silent gaps and pause without clicking the transcript', () => {
  const ref = createRef<HTMLVideoElement>()
  render(
    <>
      <video ref={ref} />
      <TranscriptTimeline transcription={transcription} videoRef={ref} videoConnected />
    </>,
  )
  const video = ref.current!
  let paused = true
  Object.defineProperty(video, 'paused', { get: () => paused })
  const hello = screen.getByRole('button', { name: /Hello/ })
  const world = screen.getByRole('button', { name: /world/ })
  const checkActive = (target: HTMLElement | null) => {
    for (const button of [hello, world]) {
      expect(button.classList.contains('transcript-active')).toBe(button === target)
      expect(button.getAttribute('aria-current')).toBe(button === target ? 'true' : null)
    }
  }
  // Native timeupdate events work even without video frame callbacks.
  act(() => {
    video.currentTime = 0.2
    paused = false
    fireEvent.play(video)
  })
  checkActive(hello)
  act(() => {
    video.currentTime = 0.65
    fireEvent.timeUpdate(video)
  })
  checkActive(world)
  act(() => {
    paused = true
    fireEvent.pause(video)
  })
  checkActive(world)
  act(() => {
    video.currentTime = 0.1
    fireEvent.seeking(video)
    fireEvent.seeked(video)
  })
  checkActive(hello)
  act(() => {
    video.currentTime = 0.6
    fireEvent.seeked(video)
  })
  checkActive(world)
  // Segment ends are exclusive; silence and end-of-video have no active row.
  act(() => {
    video.currentTime = 0.4
    fireEvent.timeUpdate(video)
  })
  checkActive(null)
  act(() => {
    video.currentTime = 0.9
    fireEvent.ended(video)
  })
  checkActive(null)
})
