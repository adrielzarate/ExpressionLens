import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SpeechExperiment } from './SpeechExperiment'
const fixtures = vi.hoisted(() => ({
  request: vi.fn(),
  terminate: vi.fn(),
  prepare: vi.fn(),
  constructed: vi.fn(),
}))
vi.mock('./client', () => ({
  SpeechClient: class {
    constructor() {
      fixtures.constructed()
    }
    request = fixtures.request
    terminate = fixtures.terminate
  },
}))
vi.mock('./audio', () => ({ prepareAudio: fixtures.prepare }))
vi.mock('./core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./core')>()),
  detectCapabilities: async () => ({ wasm: true, webgpu: false, reason: 'Test capabilities' }),
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
it('loads only on request, exposes fallback and keeps abandoned decoding results out of the UI', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  render(<SpeechExperiment />)
  await screen.findByText(/Test capabilities/)
  expect(fixtures.constructed).not.toHaveBeenCalled()
  expect(
    (screen.getByRole('option', { name: 'WebGPU (experimental)' }) as HTMLOptionElement).disabled,
  ).toBe(true)
  fixtures.request.mockResolvedValueOnce({ type: 'ready', loadMs: 42 })
  fireEvent.click(screen.getByRole('button', { name: 'Load model' }))
  await screen.findByText('Model ready.')
  fireEvent.change(screen.getByLabelText('Audio or video file'), {
    target: { files: [new File(['sample'], 'sample.wav', { type: 'audio/wav' })] },
  })
  let finish!: (value: unknown) => void
  fixtures.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Transcribe locally' }))
  await waitFor(() => expect(fixtures.prepare).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Abandon experiment' }))
  finish({
    audio: new Float32Array(16000),
    durationMs: 1000,
    decodeMs: 1,
    preprocessMs: 1,
    inputBytes: 64000,
  })
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('abandoned'))
  expect(fixtures.request).toHaveBeenCalledTimes(1)
  cleanup()
  expect(revoke).toHaveBeenCalledWith('blob:test')
})
