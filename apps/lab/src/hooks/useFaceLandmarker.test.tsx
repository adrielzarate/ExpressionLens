import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { createFaceLandmarker } from '../lib/mediapipe'
import { useFaceLandmarker } from './useFaceLandmarker'

vi.mock('../lib/mediapipe', () => ({ createFaceLandmarker: vi.fn() }))
const create = vi.mocked(createFaceLandmarker)
const detect = vi.fn()
const close = vi.fn()
let callbacks: Map<number, VideoFrameRequestCallback>
let nextHandle: number
let video: HTMLVideoElement
let frameTime: number

beforeEach(() => {
  callbacks = new Map()
  nextHandle = 0
  frameTime = 0
  video = document.createElement('video')
  Object.defineProperties(video, {
    paused: { value: false },
    readyState: { value: 4, configurable: true },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  })
  video.requestVideoFrameCallback = (cb) => {
    callbacks.set(++nextHandle, cb)
    return nextHandle
  }
  video.cancelVideoFrameCallback = (id) => {
    callbacks.delete(id)
  }
  detect.mockReset()
  close.mockReset()
  create.mockReset()
  detect.mockReturnValue({
    faceLandmarks: [[]],
    faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.7 }] }],
  })
  create.mockResolvedValue({ detectForVideo: detect, close } as unknown as FaceLandmarker)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function frame(now: number, sameFrame = false) {
  const [id, cb] = [...callbacks.entries()][0]
  callbacks.delete(id)
  if (!sameFrame) frameTime += 0.033
  const clock = vi.spyOn(performance, 'now').mockReturnValue(now)
  act(() => {
    cb(now, { mediaTime: frameTime } as VideoFrameCallbackMetadata)
  })
  clock.mockRestore()
}

describe('Face Landmarker pipeline', () => {
  it('throttles new frames, clears on no face, stops the loop, and reuses the model', async () => {
    const ref = { current: video }
    const { result, rerender, unmount } = renderHook(
      ({ active }) => useFaceLandmarker(ref, active, 10),
      { initialProps: { active: true } },
    )
    expect(create).not.toHaveBeenCalled()
    act(() => {
      result.current.load()
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    frame(0)
    frame(120, true)
    expect(detect).toHaveBeenCalledOnce()
    frame(130)
    frame(150)
    expect(detect).toHaveBeenCalledTimes(2)
    expect(result.current.snapshot.blendshapes[0].score).toBe(0.7)
    detect.mockReturnValue({ faceLandmarks: [], faceBlendshapes: [] })
    frame(240)
    expect(result.current.snapshot.faceDetected).toBe(false)
    expect(result.current.snapshot.blendshapes).toEqual([])
    rerender({ active: false })
    expect(callbacks.size).toBe(0)
    expect(result.current.snapshot.faceDetected).toBeNull()
    rerender({ active: true })
    expect(callbacks.size).toBe(1)
    expect(create).toHaveBeenCalledOnce()
    unmount()
    expect(callbacks.size).toBe(0)
    expect(close).toHaveBeenCalledOnce()
  })
  it('closes a model that finishes loading after unmount', async () => {
    let resolve!: (model: FaceLandmarker) => void
    create.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const ref = { current: video }
    const { result, unmount } = renderHook(() => useFaceLandmarker(ref, false, 10))
    act(() => {
      result.current.load()
    })
    unmount()
    await act(async () => {
      resolve({ close } as unknown as FaceLandmarker)
    })
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('mobile frame scheduling recovery', () => {
  it.each([false, true])(
    'recovers when native callbacks stall (initial frame: %s)',
    async (withInitialFrame) => {
      vi.useFakeTimers()
      const animationCallbacks = new Map<number, FrameRequestCallback>()
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        animationCallbacks.set(++nextHandle, callback)
        return nextHandle
      })
      vi.stubGlobal('cancelAnimationFrame', (id: number) => animationCallbacks.delete(id))
      const ref = { current: video }
      const { result, rerender, unmount } = renderHook(
        ({ active }) => useFaceLandmarker(ref, active, 10),
        { initialProps: { active: true } },
      )
      await act(async () => {
        result.current.load()
      })
      expect(result.current.status).toBe('ready')
      if (withInitialFrame) frame(0)
      expect(callbacks.size).toBe(1)
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(callbacks.size).toBe(0)
      expect(animationCallbacks.size).toBe(1)
      expect(result.current.snapshot.faceDetected).toBeNull()
      const fallbackFrame = (now: number) => {
        const [id, callback] = [...animationCallbacks.entries()][0]
        animationCallbacks.delete(id)
        act(() => {
          callback(now)
        })
      }
      const callsBeforeFallback = detect.mock.calls.length
      // Handoff must not process an already seen frame again.
      fallbackFrame(2000)
      expect(detect).toHaveBeenCalledTimes(callsBeforeFallback)
      video.currentTime = 1
      fallbackFrame(2100)
      expect(result.current.snapshot.scheduler).toBe('animation-frame')
      expect(detect).toHaveBeenCalledTimes(callsBeforeFallback + 1)
      fallbackFrame(2300)
      expect(detect).toHaveBeenCalledTimes(callsBeforeFallback + 1)
      rerender({ active: false })
      expect(animationCallbacks.size).toBe(0)
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(animationCallbacks.size).toBe(0)
      expect(callbacks.size).toBe(0)
      unmount()
    },
  )
})

it('accepts new presented frames with repeated timestamps and stream readyState 1', async () => {
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true })
  const ref = { current: video }
  const { result } = renderHook(() => useFaceLandmarker(ref, true, 10))
  await act(async () => {
    result.current.load()
  })
  const present = (now: number, presentedFrames: number) => {
    const [id, callback] = [...callbacks.entries()][0]
    callbacks.delete(id)
    const clock = vi.spyOn(performance, 'now').mockReturnValue(now)
    act(() => {
      callback(now, { mediaTime: 0, presentedFrames } as VideoFrameCallbackMetadata)
    })
    clock.mockRestore()
  }
  present(0, 1)
  present(110, 2)
  present(220, 2)
  expect(detect).toHaveBeenCalledTimes(2)
  expect(result.current.snapshot.faceDetected).toBe(true)
})

it('reports why a playing stream is not producing inference', async () => {
  vi.useFakeTimers()
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true })
  const ref = { current: video }
  const { result } = renderHook(() => useFaceLandmarker(ref, true, 10))
  await act(async () => {
    result.current.load()
  })
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(result.current.videoDiagnostics).toMatchObject({
    width: 640,
    height: 480,
    readyState: 1,
    paused: false,
    callbacks: 0,
    inferences: 0,
    blockedBy: 'Waiting for a frame callback',
  })
})
