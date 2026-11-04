import { afterEach, expect, it, vi } from 'vitest'
import { createRecordingController } from './recorder'
import { FakeRecorder, installMedia } from './testMedia'
const controllers: ReturnType<typeof createRecordingController>[] = []
const controller = (limit?: number) => {
  const value = createRecordingController(limit)
  controllers.push(value)
  value.activate()
  return value
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
afterEach(() => {
  controllers.splice(0).forEach((value) => value.dispose())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('requests both devices only explicitly, refuses invalid transitions and preserves final chunks only after stop', async () => {
  const media = installMedia(),
    value = controller()
  expect(value.getSnapshot().status).toBe('idle')
  expect(media.getUserMedia).not.toHaveBeenCalled()
  value.start()
  expect(FakeRecorder.instances).toHaveLength(0)
  await value.prepare()
  expect(value.getSnapshot().status).toBe('ready')
  expect(media.getUserMedia).toHaveBeenCalledWith({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: { echoCancellation: true, noiseSuppression: true },
  })
  await value.prepare()
  expect(media.getUserMedia).toHaveBeenCalledOnce()
  value.start()
  value.start()
  expect(FakeRecorder.instances).toHaveLength(1)
  const recorder = FakeRecorder.instances[0]
  expect(recorder.stream).toBe(media.stream)
  recorder.emitData(new Blob(['first'], { type: 'video/mp4' }))
  value.stop()
  expect(value.getSnapshot().status).toBe('stopping')
  expect(value.getSnapshot().recording).toBeNull()
  recorder.finish(new Blob(['last'], { type: 'video/mp4' }))
  await flush()
  expect(value.getSnapshot().status).toBe('preview')
  expect(value.getSnapshot().recording?.file.size).toBe(9)
  expect(value.getSnapshot().recording?.file.name).toMatch(/\.mp4$/)
  expect(media.video.stop).toHaveBeenCalledOnce()
  expect(media.audio.stop).toHaveBeenCalledOnce()
  value.dispose()
  expect(media.revoke).toHaveBeenCalledWith('blob:recording')
})
it('cleans up streams arriving after cancellation or unmount', async () => {
  const media = installMedia(),
    value = controller()
  let finish!: (stream: MediaStream) => void
  media.getUserMedia.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const waiting = value.prepare()
  value.cancel()
  value.dispose()
  finish(media.stream)
  await waiting
  expect(media.video.stop).toHaveBeenCalledOnce()
  expect(media.audio.stop).toHaveBeenCalledOnce()
  expect(value.getSnapshot().status).toBe('idle')
})
it('cancels an active recording, ignores late final data and releases all tracks', async () => {
  const media = installMedia(),
    value = controller()
  await value.prepare()
  value.start()
  const recorder = FakeRecorder.instances[0]
  value.cancel()
  recorder.finish()
  await flush()
  expect(value.getSnapshot().recording).toBeNull()
  expect(media.create).not.toHaveBeenCalled()
  expect(media.video.stop).toHaveBeenCalledOnce()
  expect(media.audio.stop).toHaveBeenCalledOnce()
})
it('stops at the configured duration and preserves the completed recording', async () => {
  vi.useFakeTimers()
  installMedia()
  const value = controller(1000)
  await value.prepare()
  value.start()
  await vi.advanceTimersByTimeAsync(1000)
  expect(value.getSnapshot().status).toBe('stopping')
  expect(FakeRecorder.instances[0].stop).toHaveBeenCalledOnce()
  FakeRecorder.instances[0].finish()
  await flush()
  expect(value.getSnapshot().status).toBe('preview')
  expect(value.getSnapshot().recording?.durationMs).toBe(1000)
  expect(value.getSnapshot().notice).toContain('limit')
})
it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])(
  'handles %s without retaining streams',
  async (name) => {
    const media = installMedia()
    media.getUserMedia.mockRejectedValueOnce(new DOMException('failed', name))
    const value = controller()
    await value.prepare()
    expect(value.getSnapshot().status).toBe('error')
    expect(value.getSnapshot().stream).toBeNull()
    expect(value.getSnapshot().error).toMatch(/camera|microphone/i)
  },
)
it('handles unsupported APIs before requesting permissions and retains Upload Video as the alternative', async () => {
  const media = installMedia()
  vi.stubGlobal('MediaRecorder', undefined)
  const value = controller()
  await value.prepare()
  expect(value.getSnapshot().status).toBe('error')
  expect(value.getSnapshot().error).toContain('Upload Video')
  expect(media.getUserMedia).not.toHaveBeenCalled()
})
it('reports empty output and frees devices', async () => {
  const media = installMedia(),
    value = controller()
  await value.prepare()
  value.start()
  value.stop()
  FakeRecorder.instances[0].finish(new Blob([]))
  await flush()
  expect(value.getSnapshot().status).toBe('error')
  expect(value.getSnapshot().error).toContain('empty')
  expect(media.video.stop).toHaveBeenCalledOnce()
  expect(media.audio.stop).toHaveBeenCalledOnce()
})
it.each(['track', 'error', 'hidden'] as const)(
  'preserves recorded data after an unexpected %s interruption',
  async (cause) => {
    const media = installMedia(),
      value = controller()
    await value.prepare()
    value.start()
    if (cause === 'track') media.audio.end()
    if (cause === 'error') FakeRecorder.instances[0].dispatchEvent(new Event('error'))
    if (cause === 'hidden') {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      document.dispatchEvent(new Event('visibilitychange'))
    }
    expect(value.getSnapshot().status).toBe('stopping')
    FakeRecorder.instances[0].finish()
    await flush()
    expect(value.getSnapshot().status).toBe('preview')
    expect(value.getSnapshot().notice).toBeTruthy()
    expect(media.video.stop).toHaveBeenCalledOnce()
  },
)
it('falls back to default recorder configuration when the preferred encoder constructor fails', async () => {
  installMedia()
  FakeRecorder.failPreferred = true
  const value = controller()
  await value.prepare()
  value.start()
  expect(value.getSnapshot().status).toBe('recording')
  expect(FakeRecorder.instances).toHaveLength(1)
})
it('recovers buffered data if the native stop event never arrives', async () => {
  vi.useFakeTimers()
  const media = installMedia(),
    value = controller()
  await value.prepare()
  value.start()
  FakeRecorder.instances[0].emitData()
  value.stop()
  await vi.advanceTimersByTimeAsync(10_000)
  expect(value.getSnapshot().status).toBe('preview')
  expect(value.getSnapshot().notice).toContain('incomplete')
  expect(media.video.stop).toHaveBeenCalledOnce()
  expect(media.audio.stop).toHaveBeenCalledOnce()
})
