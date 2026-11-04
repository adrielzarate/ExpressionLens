import { afterEach, expect, it, vi } from 'vitest'
import { vocalModels } from '../models'
import type { VocalModelKey } from '../models'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('./loadModel')
})
it.each<VocalModelKey>(['wav2vec2', 'emotion2vec'])(
  'loads only requested %s, preserves labels, prevents parallel models, and disposes it',
  async (key) => {
    const dispose = vi.fn(),
      loadVocalModel = vi.fn(async () => ({
        labels: [...vocalModels[key].labels],
        sampleRate: 16000,
        normalize: key === 'emotion2vec',
        dispose,
        classify: vi.fn(),
      })),
      send = vi.fn()
    vi.doMock('./loadModel', () => ({ loadVocalModel }))
    const worker: {
      postMessage: typeof send
      onmessage?: (event: { data: import('./protocol').Request }) => Promise<void>
    } = { postMessage: send }
    vi.stubGlobal('self', worker)
    await import('./vocal.worker')
    expect(loadVocalModel).not.toHaveBeenCalled()
    await worker.onmessage!({ data: { type: 'load', model: key } })
    expect(loadVocalModel).toHaveBeenCalledWith(key, expect.any(Function))
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'ready', labels: [...vocalModels[key].labels] }),
    )
    await worker.onmessage!({
      data: { type: 'load', model: key === 'wav2vec2' ? 'emotion2vec' : 'wav2vec2' },
    })
    expect(loadVocalModel).toHaveBeenCalledOnce()
    expect(send).toHaveBeenLastCalledWith({
      type: 'error',
      message: 'SER model is already loaded.',
    })
    await worker.onmessage!({ data: { type: 'dispose' } })
    expect(dispose).toHaveBeenCalledOnce()
  },
)
it('uses Emotion2vec as the configured product default with no eager initialization', async () => {
  const loadVocalModel = vi.fn(async () => ({
      labels: [...vocalModels.emotion2vec.labels],
      sampleRate: 16000,
      normalize: true,
      dispose: vi.fn(),
      classify: vi.fn(),
    })),
    send = vi.fn()
  vi.doMock('./loadModel', () => ({ loadVocalModel }))
  const worker: {
    postMessage: typeof send
    onmessage?: (event: { data: import('./protocol').Request }) => Promise<void>
  } = { postMessage: send }
  vi.stubGlobal('self', worker)
  await import('./vocal.worker')
  expect(loadVocalModel).not.toHaveBeenCalled()
  await worker.onmessage!({ data: { type: 'load' } })
  expect(loadVocalModel).toHaveBeenCalledWith('emotion2vec', expect.any(Function))
})
