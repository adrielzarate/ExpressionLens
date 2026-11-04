import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVideoSelection } from './useVideoSelection'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('revokes replaced/removed/unmounted object URLs and ignores old decode events', () => {
  const create = vi
    .fn()
    .mockReturnValueOnce('blob:one')
    .mockReturnValueOnce('blob:two')
    .mockReturnValue('blob:three')
  const revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
  const reset = vi.fn(),
    { result, unmount } = renderHook(() => useVideoSelection(reset))
  const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
  act(() => result.current.select(file))
  const first = result.current.selection!
  act(() => result.current.select(file))
  expect(revoke).toHaveBeenCalledWith('blob:one')
  reset.mockClear()
  act(() => result.current.decodeFailed(first.id))
  expect(reset).not.toHaveBeenCalled()
  expect(result.current.selection?.url).toBe('blob:two')
  act(() => result.current.remove())
  expect(revoke).toHaveBeenCalledWith('blob:two')
  act(() => result.current.select(file))
  unmount()
  expect(revoke).toHaveBeenCalledWith('blob:three')
})
it('rejects invalid files without creating a URL or resetting the previous analysis', () => {
  const create = vi.fn(),
    reset = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
    },
  )
  const { result } = renderHook(() => useVideoSelection(reset))
  act(() => result.current.select(new File(['x'], 'notes.txt', { type: 'text/plain' })))
  expect(result.current.error).toContain('Choose a video')
  expect(create).not.toHaveBeenCalled()
  expect(reset).not.toHaveBeenCalled()
})

it('keeps completed session state when a preview decode error is marked non-destructive', () => {
  const reset = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:preview')
      static revokeObjectURL = vi.fn()
    },
  )
  const { result } = renderHook(() => useVideoSelection(reset))
  act(() => result.current.select(new File(['video'], 'clip.mp4', { type: 'video/mp4' })))
  reset.mockClear()
  act(() => result.current.decodeFailed(result.current.selection!.id, { preserveSession: true }))
  expect(result.current.selection?.error).toContain('could not decode')
  expect(reset).not.toHaveBeenCalled()
})
