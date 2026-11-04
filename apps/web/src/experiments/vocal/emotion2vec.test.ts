import { afterEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => {
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
  const head = JSON.stringify({
    labels,
    weight: Array.from({ length: 9 }, () => Array(768).fill(0)),
    bias: Array(9).fill(0),
  })
  return { head, labels, create: vi.fn(), inputDispose: vi.fn() }
})
vi.mock('onnxruntime-web/webgpu', () => ({
  env: { wasm: {} },
  InferenceSession: { create: fixture.create },
  Tensor: class {
    dispose = fixture.inputDispose
  },
}))
vi.mock('./emotion2vec-assets.json', () => ({
  default: {
    publicPath: 'models/emotion-test/revision',
    files: [
      { path: 'emotion2vec_head.json', bytes: new TextEncoder().encode(fixture.head).length },
      { path: 'emotion2vec_plus_base.onnx', bytes: 4 },
    ],
  },
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('requests only same-origin pinned assets, uses WASM, and disposes input/output/session', async () => {
  vi.stubGlobal('self', { location: { origin: 'https://interview.test' } })
  vi.stubGlobal('caches', {
    open: async () => {
      throw new Error('Cache disabled')
    },
  })
  const fetch = vi.fn(
    async (url: string) => new Response(url.endsWith('.json') ? fixture.head : new Uint8Array(4)),
  )
  vi.stubGlobal('fetch', fetch)
  const outputDispose = vi.fn(),
    release = vi.fn()
  fixture.create.mockResolvedValueOnce({
    inputNames: ['input'],
    outputNames: ['features'],
    run: async () => ({
      features: { data: new Float32Array(768), dims: [1, 1, 768], dispose: outputDispose },
    }),
    release,
  })
  const { loadEmotion2vec } = await import('./emotion2vec')
  const model = await loadEmotion2vec({ mjs: '/runtime.mjs', wasm: '/runtime.wasm' }, vi.fn())
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    'https://interview.test/models/emotion-test/revision/emotion2vec_head.json',
    'https://interview.test/models/emotion-test/revision/emotion2vec_plus_base.onnx',
  ])
  expect(fetch).toHaveBeenCalledWith(expect.any(String), { redirect: 'error' })
  expect(fixture.create).toHaveBeenCalledWith(new Uint8Array(4), { executionProviders: ['wasm'] })
  const result = await model.classify(new Float32Array(16000))
  expect(result.map((x) => x.label)).toEqual(fixture.labels)
  expect(result[0].score).toBeCloseTo(1 / 9)
  expect(fixture.inputDispose).toHaveBeenCalledOnce()
  expect(outputDispose).toHaveBeenCalledOnce()
  await model.dispose()
  expect(release).toHaveBeenCalledOnce()
})
