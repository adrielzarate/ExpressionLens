import { afterEach, expect, it, vi } from 'vitest'
import { createVideoSource, readVideoMetadata, validateVideoFile } from './videoSource'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})
function decoder() {
  const video = document.createElement('video')
  let ready = 0,
    time = 0
  Object.defineProperties(video, {
    readyState: { get: () => ready },
    duration: { value: 1 },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
    currentTime: {
      get: () => time,
      set: (value: number) => {
        time = value
      },
    },
  })
  video.load = vi.fn(() => {
    if (video.getAttribute('src')) {
      ready = 2
      video.dispatchEvent(new Event('loadeddata'))
    }
  })
  video.pause = vi.fn()
  vi.spyOn(document, 'createElement').mockReturnValueOnce(video)
  return video
}
it('requires seeked even when currentTime changes immediately; uses one paused decoder and cleans it up', async () => {
  const video = decoder(),
    signal = new AbortController().signal
  const source = await createVideoSource('blob:local', signal)
  expect(source.metadata).toEqual({ durationMs: 1000, width: 640, height: 480 })
  expect(await source.frameAt(0, signal)).toBe(video)
  let resolved = false
  const pending = source.frameAt(200, signal).then((frame) => {
    resolved = true
    return frame
  })
  await Promise.resolve()
  expect(resolved).toBe(false)
  video.dispatchEvent(new Event('loadeddata'))
  await Promise.resolve()
  expect(resolved).toBe(false)
  video.dispatchEvent(new Event('seeked'))
  expect(await pending).toBe(video)
  source.dispose()
  expect(video.isConnected).toBe(false)
  expect(video.hasAttribute('src')).toBe(false)
  expect(video.pause).toHaveBeenCalledOnce()
})
it('aborts a pending seek and removes its event listeners', async () => {
  const video = decoder(),
    controller = new AbortController()
  const source = await createVideoSource('blob:local', controller.signal)
  const removed = vi.spyOn(video, 'removeEventListener')
  const pending = source.frameAt(400, controller.signal)
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  expect(removed.mock.calls.some(([name]) => name === 'seeked')).toBe(true)
  source.dispose()
})
it('handles metadata timeout and releases its dedicated element', async () => {
  vi.useFakeTimers()
  const video = decoder()
  video.load = vi.fn()
  const pending = createVideoSource('blob:broken', new AbortController().signal)
  const rejected = expect(pending).rejects.toThrow('Timed out')
  await vi.advanceTimersByTimeAsync(20_000)
  await rejected
  expect(video.isConnected).toBe(false)
})
it('validates file selection and unavailable metadata', () => {
  expect(() => validateVideoFile(new File([], 'empty.mp4', { type: 'video/mp4' }))).toThrow('empty')
  expect(() => validateVideoFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toThrow(
    'Choose a video',
  )
  expect(() => validateVideoFile(new File(['x'], 'clip.webm'))).not.toThrow()
  expect(() => readVideoMetadata(document.createElement('video'))).toThrow('metadata')
})

it('reports native decode errors and releases the failed decoder', async () => {
  const video = decoder()
  video.load = vi.fn(() => video.dispatchEvent(new Event('error')))
  await expect(createVideoSource('blob:unsupported', new AbortController().signal)).rejects.toThrow(
    'could not decode',
  )
  expect(video.isConnected).toBe(false)
  expect(video.hasAttribute('src')).toBe(false)
})

it('discovers a headerless WebM duration without rewriting bytes and restores the initial decoded frame', async () => {
  const { resolveVideoMetadata } = await import('./videoSource')
  const video = document.createElement('video')
  let duration = Infinity,
    current = 0
  Object.defineProperties(video, {
    readyState: { value: 2 },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
    duration: { get: () => duration },
    currentTime: {
      get: () => current,
      set: (time: number) => {
        current = time
        queueMicrotask(() => {
          if (time > 10000) {
            duration = 1
            current = 1
            video.dispatchEvent(new Event('durationchange'))
          }
          video.dispatchEvent(new Event('seeked'))
        })
      },
    },
  })
  expect(await resolveVideoMetadata(video, new AbortController().signal)).toEqual({
    durationMs: 1000,
    width: 640,
    height: 480,
  })
  expect(video.currentTime).toBe(0)
})
