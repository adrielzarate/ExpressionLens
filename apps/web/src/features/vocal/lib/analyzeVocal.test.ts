import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { analyzeVocal } from './analyzeVocal'
import { vocalModels } from '../models'
import { emotionVocalFixture } from '../test/fixtures'
import type { VocalModelKey } from '../models'
import { vocalFixture } from '../test/fixtures'
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  terminate: vi.fn(),
  prepare: vi.fn(),
  model: 'wav2vec2' as 'wav2vec2' | 'emotion2vec',
}))
vi.mock('../config', () => ({
  get ACTIVE_SER_MODEL() {
    return mocks.model
  },
}))
vi.mock('./client', () => ({
  VocalClient: class {
    request = mocks.request
    terminate = mocks.terminate
  },
}))
vi.mock('../../speech/lib/audio', async (original) => ({
  ...(await original<typeof import('../../speech/lib/audio')>()),
  prepareAudio: mocks.prepare,
}))
const audio = () => ({
  audio: new Float32Array(16000),
  durationMs: 1000,
  inputBytes: 64000,
  decodeMs: 1,
  preprocessMs: 1,
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.model = 'wav2vec2'
  vi.stubGlobal('Worker', class {})
  vi.stubGlobal('AudioContext', class {})
  vi.stubGlobal('OfflineAudioContext', class {})
  mocks.prepare.mockResolvedValue(audio())
  mocks.request.mockImplementation(async (req) =>
    req.type === 'load'
      ? { type: 'ready', loadMs: 1, labels: [...vocalModels[mocks.model].labels] }
      : req.type === 'dispose'
        ? { type: 'disposed' }
        : {
            type: 'result',
            inferenceMs: 2,
            samples: (mocks.model === 'wav2vec2' ? vocalFixture() : emotionVocalFixture()).samples,
          },
  )
})
afterEach(() => vi.unstubAllGlobals())
it.each<VocalModelKey>(['wav2vec2', 'emotion2vec'])(
  'reuses PCM with configured %s, preserves its mapping and disposes the worker',
  async (key) => {
    mocks.model = key
    const prepared = audio()
    const result = await analyzeVocal(
      new File(['v'], 'v.mp4'),
      1000,
      new AbortController().signal,
      vi.fn(),
      prepared,
    )
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.request.mock.calls[0][0]).toEqual({ type: 'load', model: key })
    expect(mocks.request.mock.calls[1][0]).toMatchObject({ audio: prepared.audio, seconds: 3 })
    expect(result.metadata).toMatchObject({ windowSeconds: 3, stepMs: 3000, overlapMs: 0 })
    expect(result.samples).toEqual(
      (key === 'wav2vec2' ? vocalFixture() : emotionVocalFixture()).samples,
    )
    expect(result.metadata).toMatchObject({
      modelId: vocalModels[key].manifest.modelId,
      revision: vocalModels[key].manifest.revision,
      dtype: vocalModels[key].dtype,
      labels: [...vocalModels[key].labels],
      preprocessing: vocalModels[key].preprocessing,
    })
    expect(mocks.request.mock.calls.at(-1)![0]).toEqual({ type: 'dispose' })
    expect(mocks.terminate).toHaveBeenCalled()
  },
)
it('retains explicit partial windows rather than inventing predictions', async () => {
  const samples = vocalFixture().samples
  samples[1] = { ...samples[1], status: 'failed', error: 'kernel error' }
  mocks.request
    .mockResolvedValueOnce({ type: 'ready', loadMs: 1, labels: ['neu', 'hap', 'ang', 'sad'] })
    .mockResolvedValueOnce({ type: 'result', samples, inferenceMs: 2 })
  const result = await analyzeVocal(
    new File(['v'], 'v.mp4'),
    1000,
    new AbortController().signal,
    vi.fn(),
  )
  expect(result.status).toBe('partial')
  expect(result.samples[1].predictedLabel).toBeNull()
  expect(result.error).toContain('1 vocal windows failed')
})
it('does not load a model after late decoding following cancellation', async () => {
  const controller = new AbortController()
  mocks.prepare.mockImplementation(async () => {
    controller.abort()
    return audio()
  })
  await expect(
    analyzeVocal(new File(['v'], 'v.mp4'), 1000, controller.signal, vi.fn()),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.request).not.toHaveBeenCalled()
})
it('rejects load failures, terminates the failed worker and never analyzes', async () => {
  mocks.request.mockRejectedValueOnce(new Error('Missing local model'))
  await expect(
    analyzeVocal(new File(['v'], 'v.mp4'), 1000, new AbortController().signal, vi.fn()),
  ).rejects.toThrow('Missing local model')
  expect(mocks.request).toHaveBeenCalledOnce()
  expect(mocks.terminate).toHaveBeenCalled()
})
