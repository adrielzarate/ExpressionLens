import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCamera } from './useCamera'

const getUserMedia = vi.fn()
const stopTrack = vi.fn()
const track = { stop: stopTrack, onended: null as (() => void) | null }
const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream

beforeEach(() => {
  getUserMedia.mockReset()
  stopTrack.mockReset()
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('camera lifecycle', () => {
  it('does not request permission on mount and releases a late permission result after Stop', async () => {
    let resolve!: (value: MediaStream) => void
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((done) => {
        resolve = done
      }),
    )
    const { result } = renderHook(useCamera)
    expect(getUserMedia).not.toHaveBeenCalled()
    let pending!: Promise<void>
    act(() => {
      pending = result.current.start()
    })
    act(() => {
      result.current.stop()
    })
    await act(async () => {
      resolve(stream)
      await pending
    })
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('idle')
  })
  it('releases a stream returned after unmount', async () => {
    let resolve!: (value: MediaStream) => void
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((done) => {
        resolve = done
      }),
    )
    const { result, unmount } = renderHook(useCamera)
    let pending!: Promise<void>
    act(() => {
      pending = result.current.start()
    })
    unmount()
    await act(async () => {
      resolve(stream)
      await pending
    })
    expect(stopTrack).toHaveBeenCalledOnce()
  })
  it('starts video only, handles disconnection, and clears the video source', async () => {
    getUserMedia.mockResolvedValue(stream)
    const { result } = renderHook(useCamera)
    result.current.videoRef.current = document.createElement('video')
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('live')
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
    act(() => {
      track.onended?.()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.videoRef.current?.srcObject).toBeNull()
    expect(stopTrack).toHaveBeenCalledOnce()
  })
  it('explains permission denial and insecure contexts', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const { result } = renderHook(useCamera)
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.error).toContain('denied')
    vi.stubGlobal('isSecureContext', false)
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.error).toContain('HTTPS')
    expect(getUserMedia).toHaveBeenCalledOnce()
  })
})

it('resumes the existing video without requesting another camera stream', async () => {
  getUserMedia.mockResolvedValue(stream)
  const { result } = renderHook(useCamera)
  result.current.videoRef.current = document.createElement('video')
  await act(async () => {
    await result.current.start()
  })
  await act(async () => {
    await result.current.resume()
  })
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2)
  expect(getUserMedia).toHaveBeenCalledOnce()
  expect(result.current.status).toBe('live')
})
