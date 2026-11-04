import { expect, it, vi } from 'vitest'
import { VocalClient } from './client'
import type { Response } from './protocol'
function setup() {
  const worker = {
    onmessage: null as ((event: MessageEvent<Response>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }
  const progress = vi.fn()
  const client = new VocalClient(progress, () => worker as unknown as Worker)
  const emit = (data: Response) => worker.onmessage?.({ data } as MessageEvent<Response>)
  return { client, worker, emit, progress }
}
it('serializes operations and separates progress from the final result', async () => {
  const { client, emit, progress } = setup()
  const pending = client.request({ type: 'load' })
  await expect(client.request({ type: 'load' })).rejects.toThrow('already running')
  emit({ type: 'progress', message: 'Downloading 50%' })
  expect(progress).toHaveBeenCalledWith('Downloading 50%', undefined, undefined)
  emit({
    type: 'ready',
    loadMs: 123,
    labels: ['neu', 'hap', 'ang', 'sad'],
    sampleRate: 16000,
    normalize: false,
  })
  await expect(pending).resolves.toEqual({
    type: 'ready',
    loadMs: 123,
    labels: ['neu', 'hap', 'ang', 'sad'],
    sampleRate: 16000,
    normalize: false,
  })
})
it('transfers local PCM and propagates backend errors', async () => {
  const { client, worker, emit } = setup()
  const audio = new Float32Array(16000)
  const pending = client.request({ type: 'analyze', audio, seconds: 5, silenceRms: 0.0001 }, [
    audio.buffer,
  ])
  expect(worker.postMessage).toHaveBeenCalledWith(
    { type: 'analyze', audio, seconds: 5, silenceRms: 0.0001 },
    [audio.buffer],
  )
  emit({ type: 'error', message: 'unsupported operator' })
  await expect(pending).rejects.toThrow('unsupported operator')
})
it('abandons pending work and detaches stale callbacks', async () => {
  const { client, worker } = setup()
  const pending = client.request({ type: 'load' })
  client.terminate()
  await expect(pending).rejects.toThrow('abandoned')
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(worker.onmessage).toBeNull()
  expect(worker.onerror).toBeNull()
})
it('surfaces Worker failures instead of leaving the UI waiting', async () => {
  const { client, worker } = setup()
  const pending = client.request({ type: 'load' })
  worker.onerror?.({ message: 'Worker stopped' } as ErrorEvent)
  await expect(pending).rejects.toThrow('Worker stopped')
})
