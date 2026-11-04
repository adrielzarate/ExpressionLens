import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVideoAnalysis } from './useVideoAnalysis'
import { analyzeVideo } from '../lib/analyzeVideo'
import type { AnalysisSession } from '../types'

vi.mock('../lib/analyzeVideo', () => ({ analyzeVideo: vi.fn() }))
afterEach(cleanup)
const session: AnalysisSession = {
  id: 'one',
  createdAt: '',
  source: 'upload',
  durationMs: 1000,
  modelVersion: 'v3',
  samplingFps: 5,
  samples: [],
}
it('prevents overlap, suppresses stale progress/completion after replacement, and restarts only after cleanup', async () => {
  let finish!: (session: AnalysisSession) => void
  vi.mocked(analyzeVideo)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValue(session)
  const { result } = renderHook(useVideoAnalysis)
  let running!: Promise<void>
  act(() => {
    running = result.current.start('blob:old')
  })
  await act(async () => {
    await result.current.start('blob:duplicate')
  })
  expect(analyzeVideo).toHaveBeenCalledOnce()
  const [, signal, progress] = vi.mocked(analyzeVideo).mock.calls[0]
  act(() => {
    result.current.reset()
    progress({ totalFrames: 5, processedFrames: 4, timestampMs: 600 })
  })
  expect(signal.aborted).toBe(true)
  expect(result.current.progress).toBeNull()
  expect(result.current.busy).toBe(true)
  await act(async () => {
    finish(session)
    await running
  })
  expect(result.current.session).toBeNull()
  expect(result.current.busy).toBe(false)
  await act(async () => {
    await result.current.start('blob:new')
  })
  expect(result.current.status).toBe('completed')
  expect(result.current.session).toEqual(session)
})
it('cancels safely and aborts pending work on unmount', async () => {
  let finish!: (session: AnalysisSession) => void
  vi.mocked(analyzeVideo).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { result, unmount } = renderHook(useVideoAnalysis)
  let running!: Promise<void>
  act(() => {
    running = result.current.start('blob:test')
  })
  const signal = vi.mocked(analyzeVideo).mock.calls[0][1]
  act(() => result.current.cancel())
  expect(signal.aborted).toBe(true)
  expect(result.current.status).toBe('cancelled')
  expect(result.current.busy).toBe(true)
  await act(async () => {
    finish(session)
    await running
  })
  expect(result.current.session).toBeNull()
  expect(result.current.busy).toBe(false)
  act(() => {
    running = result.current.start('blob:restart')
  })
  const nextSignal = vi.mocked(analyzeVideo).mock.calls.at(-1)![1]
  unmount()
  expect(nextSignal.aborted).toBe(true)
  await act(async () => {
    finish(session)
    await running
  })
})
it('reports recoverable errors and does not remain busy', async () => {
  vi.mocked(analyzeVideo)
    .mockRejectedValueOnce(new Error('model unavailable'))
    .mockResolvedValue(session)
  const { result } = renderHook(useVideoAnalysis)
  await act(async () => {
    await result.current.start('blob:test')
  })
  expect(result.current.status).toBe('error')
  expect(result.current.error).toBe('model unavailable')
  expect(result.current.busy).toBe(false)
  await act(async () => {
    await result.current.start('blob:retry')
  })
  expect(result.current.status).toBe('completed')
})

it('restores an imported session and ignores callbacks from an older pending analysis', async () => {
  let finish!: (value: AnalysisSession) => void
  vi.mocked(analyzeVideo).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { result } = renderHook(useVideoAnalysis)
  let running!: Promise<void>
  act(() => {
    running = result.current.start('blob:old')
  })
  const [, signal, progress] = vi.mocked(analyzeVideo).mock.calls[0]
  const imported = { ...session, id: 'imported' }
  act(() => {
    result.current.restore(imported)
    progress({ processedFrames: 4, totalFrames: 5, timestampMs: 600 })
  })
  expect(signal.aborted).toBe(true)
  expect(result.current.session).toBe(imported)
  expect(result.current.progress).toBeNull()
  expect(result.current.busy).toBe(true)
  await act(async () => {
    finish(session)
    await running
  })
  expect(result.current.session).toBe(imported)
  expect(result.current.busy).toBe(false)
})
