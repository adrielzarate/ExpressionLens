import { expect, it, vi } from 'vitest'
import { SpeechClient } from './client'
import type { Response } from './protocol'
function setup() {
  const worker = {
    onmessage: null as ((event: MessageEvent<Response>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }
  const progress = vi.fn()
  const client = new SpeechClient(progress, () => worker as unknown as Worker)
  const emit = (data: Response) => worker.onmessage?.({ data } as MessageEvent<Response>)
  return { client, worker, emit, progress }
}
it('serializes operations and separates progress from the final result', async () => {
  const { client, emit, progress } = setup()
  const pending = client.request({ type: 'load', backend: 'wasm' })
  await expect(client.request({ type: 'load', backend: 'webgpu' })).rejects.toThrow(
    'already running',
  )
  emit({ type: 'progress', message: 'Downloading 50%' })
  expect(progress).toHaveBeenCalledWith('Downloading 50%')
  emit({ type: 'ready', loadMs: 123 })
  await expect(pending).resolves.toEqual({ type: 'ready', loadMs: 123 })
})
it('transfers local PCM and propagates backend errors', async () => {
  const { client, worker, emit } = setup()
  const audio = new Float32Array(16000)
  const pending = client.request({ type: 'transcribe', audio, language: 'spanish' }, [audio.buffer])
  expect(worker.postMessage).toHaveBeenCalledWith(
    { type: 'transcribe', audio, language: 'spanish' },
    [audio.buffer],
  )
  emit({ type: 'error', message: 'unsupported operator' })
  await expect(pending).rejects.toThrow('unsupported operator')
})
it('abandons pending work and detaches stale callbacks', async () => {
  const { client, worker } = setup()
  const pending = client.request({ type: 'load', backend: 'wasm' })
  client.terminate()
  await expect(pending).rejects.toThrow('abandoned')
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(worker.onmessage).toBeNull()
  expect(worker.onerror).toBeNull()
})
it('surfaces Worker failures instead of leaving the UI waiting', async () => {
  const { client, worker } = setup()
  const pending = client.request({ type: 'load', backend: 'wasm' })
  worker.onerror?.({ message: 'Worker stopped' } as ErrorEvent)
  await expect(pending).rejects.toThrow('Worker stopped')
})
