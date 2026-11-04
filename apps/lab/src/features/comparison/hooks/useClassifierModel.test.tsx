import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useClassifierModel } from './useClassifierModel'
import { loadClassifier } from '../lib/loadClassifier'
import { classifier } from '../test/fixtures'
import type { ClassifierFiles, LoadedClassifier } from '../types/comparison'

vi.mock('../lib/loadClassifier', () => ({ loadClassifier: vi.fn() }))
afterEach(cleanup)
const files = {
  model: new File(['{}'], 'model.json'),
  metadata: new File(['{}'], 'metadata.json'),
  weights: [new File(['x'], 'weights.bin')],
} satisfies ClassifierFiles
it('disposes a replaced/unloaded model and a load finishing after unmount', async () => {
  const dispose = vi.fn()
  vi.mocked(loadClassifier).mockResolvedValue(classifier(undefined, dispose))
  const { result, unmount } = renderHook(useClassifierModel)
  await act(async () => {
    await result.current.load(files)
  })
  expect(result.current.status).toBe('ready')
  act(() => {
    result.current.unload()
  })
  expect(dispose).toHaveBeenCalledOnce()
  expect(result.current.model).toBeNull()
  let resolve!: (model: LoadedClassifier) => void
  vi.mocked(loadClassifier).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  let pending!: Promise<boolean>
  act(() => {
    pending = result.current.load(files)
  })
  unmount()
  await act(async () => {
    resolve(classifier(undefined, dispose))
    await pending
  })
  expect(dispose).toHaveBeenCalledTimes(2)
})
it('ignores an old load when a newer replacement finishes first', async () => {
  let resolve!: (model: LoadedClassifier) => void
  const oldDispose = vi.fn(),
    newDispose = vi.fn()
  vi.mocked(loadClassifier)
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    .mockResolvedValueOnce({ ...classifier(undefined, newDispose), id: 'new-model' })
  const { result } = renderHook(useClassifierModel)
  let pending!: Promise<boolean>
  act(() => {
    pending = result.current.load(files)
  })
  await act(async () => {
    await result.current.load(files)
  })
  await act(async () => {
    resolve(classifier(undefined, oldDispose))
    await pending
  })
  expect(result.current.model?.id).toBe('new-model')
  expect(oldDispose).toHaveBeenCalledOnce()
  expect(newDispose).not.toHaveBeenCalled()
})
