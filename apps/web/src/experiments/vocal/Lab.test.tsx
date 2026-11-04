import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VocalLab } from './Lab'
const fixtures = vi.hoisted(() => ({
  request: vi.fn(),
  terminate: vi.fn(),
  prepare: vi.fn(),
  constructed: vi.fn(),
}))
vi.mock('./client', () => ({
  VocalClient: class {
    constructor() {
      fixtures.constructed()
    }
    request = fixtures.request
    terminate = fixtures.terminate
  },
}))
vi.mock('../../features/speech/lib/audio', () => ({ prepareAudio: fixtures.prepare }))
vi.mock('../../features/speech/lib/core', async (original) => ({
  ...(await original<typeof import('../../features/speech/lib/core')>()),
  detectCapabilities: async () => ({ wasm: true, webgpu: false, reason: 'test' }),
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
it('loads only explicitly, reads actual labels and abandons late decoding without starting a second operation', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vocal-test')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  render(<VocalLab />)
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Load SER model' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  expect(fixtures.constructed).not.toHaveBeenCalled()
  fixtures.request.mockResolvedValueOnce({
    type: 'ready',
    loadMs: 42,
    labels: ['neu', 'hap', 'ang', 'sad'],
    sampleRate: 16000,
    normalize: false,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Load SER model' }))
  await screen.findByText('SER model ready.')
  expect(screen.getByRole('option', { name: 'hap' })).toBeDefined()
  fireEvent.change(screen.getByLabelText('Audio or video file'), {
    target: { files: [new File(['pcm'], 'test.wav', { type: 'audio/wav' })] },
  })
  let finish!: (value: unknown) => void
  fixtures.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Analyze vocal expression' }))
  await waitFor(() => expect(fixtures.prepare).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Abandon experiment' }))
  finish({ audio: new Float32Array(16000), durationMs: 1000, decodeMs: 1, preprocessMs: 1 })
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Abandoned'))
  expect(fixtures.request).toHaveBeenCalledTimes(1)
  cleanup()
  expect(revoke).toHaveBeenCalledWith('blob:vocal-test')
})
it('unloads on model selection, stays lazy, and retains each run’s model and category mapping', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vocal-test')
  render(<VocalLab />)
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Load SER model' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  fixtures.request.mockResolvedValueOnce({
    type: 'ready',
    labels: ['neu', 'hap', 'ang', 'sad'],
    normalize: false,
    loadMs: 1,
    sampleRate: 16000,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Load SER model' }))
  await screen.findByText('SER model ready.')
  expect(fixtures.request).toHaveBeenCalledWith({ type: 'load', model: 'wav2vec2' })
  fireEvent.change(screen.getByLabelText('Audio or video file'), {
    target: { files: [new File(['pcm'], 'test.wav', { type: 'audio/wav' })] },
  })
  fixtures.prepare.mockResolvedValueOnce({
    audio: new Float32Array(16000),
    durationMs: 1000,
    decodeMs: 1,
    preprocessMs: 1,
  })
  fixtures.request.mockResolvedValueOnce({
    type: 'result',
    samples: [
      {
        startMs: 0,
        endMs: 1000,
        predictedLabel: 'hap',
        status: 'classified',
        margin: 0.4,
        scores: { neu: 0.2, hap: 0.6, ang: 0.1, sad: 0.1 },
      },
    ],
    inferenceMs: 2,
    modelPreprocessMs: 1,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze vocal expression' }))
  await screen.findByRole('heading', { name: 'test.wav · Wav2Vec2 SUPERB ER' })
  fixtures.request.mockResolvedValueOnce({ type: 'disposed' })
  fireEvent.change(screen.getByLabelText('Vocal expression model'), {
    target: { value: 'emotion2vec' },
  })
  await screen.findByText('Model not loaded. Load the selected model to continue.')
  expect(fixtures.request).toHaveBeenLastCalledWith({ type: 'dispose' })
  expect(fixtures.terminate).toHaveBeenCalled()
  expect(screen.getByText(/hap: 1/)).toBeDefined()
  expect(screen.queryByRole('heading', { name: 'Timestamped vocal expression windows' })).toBeNull()
  fixtures.request.mockResolvedValueOnce({
    type: 'ready',
    labels: [
      'angry',
      'disgusted',
      'fearful',
      'happy',
      'neutral',
      'other',
      'sad',
      'surprised',
      'unknown',
    ],
    normalize: true,
    loadMs: 2,
    sampleRate: 16000,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Load SER model' }))
  await screen.findByText('SER model ready.')
  expect(fixtures.request).toHaveBeenLastCalledWith({ type: 'load', model: 'emotion2vec' })
  expect(screen.getByRole('option', { name: /^disgusted$/ })).toBeDefined()
  expect(screen.getByText(/hap: 1/)).toBeDefined()
})
