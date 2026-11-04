import { afterEach, expect, it, vi } from 'vitest'
const adapters = vi.hoisted(() => ({ wav: vi.fn(), emotion: vi.fn() }))
vi.mock('./wav2vec', () => ({ loadWav2vec: adapters.wav }))
vi.mock('./emotion2vec', () => ({ loadEmotion2vec: adapters.emotion }))
import { loadVocalModel } from './loadModel'
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
it('loads only the requested adapter, retaining model-specific preprocessing and raw scores', async () => {
  vi.stubGlobal('self', { location: { origin: 'https://expressionlens.test' } })
  const scores = [{ label: 'angry', score: 1 }]
  const classify = vi.fn(async () => scores),
    dispose = vi.fn()
  adapters.emotion.mockResolvedValueOnce({ labels: ['angry'], classify, dispose })
  const model = await loadVocalModel('emotion2vec', vi.fn())
  expect(adapters.wav).not.toHaveBeenCalled()
  expect(adapters.emotion).toHaveBeenCalledOnce()
  expect(await model.classify(new Float32Array(16000))).toBe(scores)
  expect(model.sampleRate).toBe(16000)
  expect(model.normalize).toBe(true)
  await model.dispose()
  expect(dispose).toHaveBeenCalledOnce()
})
it('keeps Wav2Vec2 available through the same interface without loading Emotion2vec', async () => {
  const original = {
    labels: ['neu', 'hap', 'ang', 'sad'],
    sampleRate: 16000,
    normalize: false,
    classify: vi.fn(),
    dispose: vi.fn(),
  }
  adapters.wav.mockResolvedValueOnce(original)
  expect(await loadVocalModel('wav2vec2', vi.fn())).toBe(original)
  expect(adapters.emotion).not.toHaveBeenCalled()
})
