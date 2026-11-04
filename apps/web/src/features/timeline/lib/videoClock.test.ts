import { afterEach, expect, it, vi } from 'vitest'
import { subscribeVideoClock } from './videoClock'

afterEach(() => vi.unstubAllGlobals())
function player() {
  const video = document.createElement('video')
  let paused = true,
    ended = false
  Object.defineProperties(video, { paused: { get: () => paused }, ended: { get: () => ended } })
  return {
    video,
    pause: (value: boolean) => {
      paused = value
    },
    end: () => {
      ended = true
    },
  }
}
it('reads native seeks, pause, restart and end from the existing video and removes listeners', () => {
  const { video, end } = player(),
    read = vi.fn()
  const dispose = subscribeVideoClock(video, read)
  expect(read).toHaveBeenLastCalledWith(0)
  video.currentTime = 0.6
  video.dispatchEvent(new Event('seeked'))
  expect(read).toHaveBeenLastCalledWith(600)
  video.dispatchEvent(new Event('pause'))
  expect(read).toHaveBeenLastCalledWith(600)
  video.currentTime = 0
  video.dispatchEvent(new Event('seeking'))
  expect(read).toHaveBeenLastCalledWith(0)
  end()
  video.currentTime = 1
  video.dispatchEvent(new Event('ended'))
  expect(read).toHaveBeenLastCalledWith(1000)
  const count = read.mock.calls.length
  dispose()
  video.dispatchEvent(new Event('timeupdate'))
  expect(read).toHaveBeenCalledTimes(count)
})
it('uses one requestVideoFrameCallback while playing, and cancels on pause/unmount', () => {
  const { video, pause } = player(),
    read = vi.fn()
  let frame!: VideoFrameRequestCallback
  video.requestVideoFrameCallback = vi.fn((callback) => {
    frame = callback
    return 12
  })
  video.cancelVideoFrameCallback = vi.fn()
  const dispose = subscribeVideoClock(video, read)
  expect(video.requestVideoFrameCallback).not.toHaveBeenCalled()
  pause(false)
  video.dispatchEvent(new Event('play'))
  video.dispatchEvent(new Event('timeupdate'))
  expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce()
  video.currentTime = 0.24
  frame(0, {} as VideoFrameCallbackMetadata)
  expect(read).toHaveBeenLastCalledWith(240)
  expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2)
  pause(true)
  video.dispatchEvent(new Event('pause'))
  expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(12)
  pause(false)
  video.dispatchEvent(new Event('play'))
  dispose()
  expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(2)
  const count = read.mock.calls.length
  frame(0, {} as VideoFrameCallbackMetadata)
  expect(read).toHaveBeenCalledTimes(count)
})
it('falls back to animation frames without a second playback timer', () => {
  const { video, pause } = player(),
    read = vi.fn()
  let frame!: FrameRequestCallback
  const request = vi.fn((callback: FrameRequestCallback) => {
      frame = callback
      return 8
    }),
    cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined })
  const dispose = subscribeVideoClock(video, read)
  pause(false)
  video.dispatchEvent(new Event('play'))
  expect(request).toHaveBeenCalledOnce()
  video.currentTime = 0.5
  frame(0)
  expect(read).toHaveBeenLastCalledWith(500)
  pause(true)
  video.dispatchEvent(new Event('pause'))
  expect(cancel).toHaveBeenCalledWith(8)
  dispose()
})

it('multiplexes all modalities through one media subscription and disposes after the last subscriber', () => {
  const video = document.createElement('video'),
    add = vi.spyOn(video, 'addEventListener'),
    remove = vi.spyOn(video, 'removeEventListener')
  const first = vi.fn(),
    second = vi.fn()
  const one = subscribeVideoClock(video, first),
    two = subscribeVideoClock(video, second)
  expect(add.mock.calls.filter(([name]) => name === 'timeupdate')).toHaveLength(1)
  video.currentTime = 1.5
  video.dispatchEvent(new Event('timeupdate'))
  expect(first).toHaveBeenLastCalledWith(1500)
  expect(second).toHaveBeenLastCalledWith(1500)
  one()
  expect(remove).not.toHaveBeenCalled()
  two()
  expect(remove.mock.calls.filter(([name]) => name === 'timeupdate')).toHaveLength(1)
})
