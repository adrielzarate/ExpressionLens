import { afterEach, expect, it, vi } from 'vitest'
import manifest from '../../features/vocal/assets.json'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('@huggingface/transformers')
})
it('initializes only on request, reads actual preprocessing/labels and enforces local-only q4 WASM', async () => {
  const fetch = vi.fn(async (_url: string | URL, _init?: RequestInit) => ({ ok: true })),
    send = vi.fn()
  const env = {
    allowLocalModels: false,
    allowRemoteModels: true,
    useBrowserCache: false,
    localModelPath: '',
    remoteHost: '',
    fetch,
    backends: { onnx: { wasm: {} } },
  }
  const model = Object.assign(vi.fn(), {
    model: { config: { id2label: { 0: 'neu', 1: 'hap', 2: 'ang', 3: 'sad' } } },
    processor: {
      feature_extractor: {
        config: {
          sampling_rate: 16000,
          feature_extractor_type: 'Wav2Vec2FeatureExtractor',
          do_normalize: false,
        },
      },
    },
    dispose: vi.fn(),
  })
  const pipeline = vi.fn(async () => model)
  vi.doMock('@huggingface/transformers', () => ({ env, pipeline }))
  const worker: {
    location: { origin: string }
    postMessage: typeof send
    onmessage?: (event: { data: { type: 'load' } }) => Promise<void>
  } = { location: { origin: 'https://interview.test' }, postMessage: send }
  vi.stubGlobal('self', worker)
  await import('./vocal.worker')
  expect(pipeline).not.toHaveBeenCalled()
  await worker.onmessage!({ data: { type: 'load' } })
  expect(env.allowRemoteModels).toBe(false)
  expect(env.allowLocalModels).toBe(true)
  expect(env.useBrowserCache).toBe(true)
  expect(() => env.fetch('https://huggingface.co/model.onnx')).toThrow('blocked')
  expect(pipeline).toHaveBeenCalledWith(
    'audio-classification',
    `/${manifest.publicPath}/`,
    expect.objectContaining({ device: 'wasm', dtype: 'q4', local_files_only: true }),
  )
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'ready',
      labels: ['neu', 'hap', 'ang', 'sad'],
      sampleRate: 16000,
      normalize: false,
    }),
  )
})
it('loads the selected nine-class adapter without constructing Wav2Vec2, and disposes it', async () => {
  const send = vi.fn(),
    dispose = vi.fn(),
    classify = vi.fn()
  const labels = [
    'angry',
    'disgusted',
    'fearful',
    'happy',
    'neutral',
    'other',
    'sad',
    'surprised',
    'unknown',
  ]
  const loadEmotion2vec = vi.fn(async () => ({ labels, classify, dispose }))
  vi.doMock('../../features/vocal/lib/emotion2vec', () => ({ loadEmotion2vec }))
  const pipeline = vi.fn()
  vi.doMock('@huggingface/transformers', () => ({
    pipeline,
    env: { fetch: vi.fn(), backends: { onnx: { wasm: {} } } },
  }))
  const worker: {
    location: { origin: string }
    postMessage: typeof send
    onmessage?: (event: { data: import('./protocol').Request }) => Promise<void>
  } = { location: { origin: 'https://interview.test' }, postMessage: send }
  vi.stubGlobal('self', worker)
  await import('./vocal.worker')
  expect(loadEmotion2vec).not.toHaveBeenCalled()
  await worker.onmessage!({ data: { type: 'load', model: 'emotion2vec' } })
  expect(pipeline).not.toHaveBeenCalled()
  expect(loadEmotion2vec).toHaveBeenCalledWith(
    expect.objectContaining({
      wasm: expect.stringContaining('https://interview.test/stt-runtime/'),
    }),
    expect.any(Function),
  )
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'ready', labels, normalize: true }),
  )
  await worker.onmessage!({ data: { type: 'load', model: 'wav2vec2' } })
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'error', message: 'SER model is already loaded.' }),
  )
  await worker.onmessage!({ data: { type: 'dispose' } })
  expect(dispose).toHaveBeenCalledOnce()
  vi.doUnmock('../../features/vocal/lib/emotion2vec')
})
