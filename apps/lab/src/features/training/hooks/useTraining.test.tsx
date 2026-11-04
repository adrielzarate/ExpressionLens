import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useTraining } from './useTraining'
import { prepareDataset } from '../lib/prepareDataset'
import { trainingDataset } from '../test/fixtures'
import { defaultTrainingConfig } from '../types/training'
import type { TrainingResponse } from '../types/training'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage: ((event: MessageEvent<TrainingResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    TestWorker.instances.push(this)
  }
}
beforeEach(() => {
  TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('starts one worker, streams progress, and terminates it when cancelled or unmounted', () => {
  const { result, unmount } = renderHook(useTraining)
  const data = prepareDataset(trainingDataset(4))
  act(() => {
    result.current.start(data, defaultTrainingConfig)
    result.current.start(data, defaultTrainingConfig)
  })
  expect(TestWorker.instances).toHaveLength(1)
  const worker = TestWorker.instances[0]
  expect(worker.postMessage).toHaveBeenCalledWith({
    type: 'train',
    data,
    config: defaultTrainingConfig,
  })
  act(() => {
    worker.onmessage?.({
      data: {
        type: 'epoch',
        metrics: { epoch: 1, loss: 1, validationLoss: 1.1, accuracy: 0.5, validationAccuracy: 0.4 },
      },
    } as MessageEvent<TrainingResponse>)
  })
  expect(result.current.history).toHaveLength(1)
  act(() => {
    result.current.cancel()
  })
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(result.current.status).toBe('cancelled')
  act(() => {
    worker.onerror?.({ message: 'stale' } as ErrorEvent)
    worker.onmessageerror?.()
  })
  expect(result.current.status).toBe('cancelled')
  act(() => {
    result.current.start(data, defaultTrainingConfig)
  })
  unmount()
  expect(TestWorker.instances[1].terminate).toHaveBeenCalledOnce()
})
it('surfaces worker errors and releases the worker', () => {
  const { result } = renderHook(useTraining)
  act(() => {
    result.current.start(prepareDataset(trainingDataset(4)), defaultTrainingConfig)
  })
  const worker = TestWorker.instances[0]
  act(() => {
    worker.onmessage?.({
      data: { type: 'error', message: 'Out of memory' },
    } as MessageEvent<TrainingResponse>)
  })
  expect(result.current.error).toBe('Out of memory')
  expect(result.current.status).toBe('error')
  expect(worker.terminate).toHaveBeenCalledOnce()
})
