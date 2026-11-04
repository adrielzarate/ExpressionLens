import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { transcribeVideo } from './transcribeVideo'
const mocks = vi.hoisted(() => ({ request: vi.fn(), terminate: vi.fn(), prepare: vi.fn() }))
vi.mock('./client', () => ({
  SpeechClient: class {
    request = mocks.request
    terminate = mocks.terminate
  },
}))
vi.mock('./audio', () => ({ prepareAudio: mocks.prepare }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('Worker', class {})
  vi.stubGlobal('AudioContext', class {})
  vi.stubGlobal('OfflineAudioContext', class {})
  mocks.request.mockImplementation(async (request) =>
    request.type === 'load'
      ? { type: 'ready', loadMs: 20 }
      : request.type === 'dispose'
        ? { type: 'disposed' }
        : {
            type: 'result',
            inferenceMs: 10,
            output: { text: 'Hello', chunks: [{ text: 'Hello', timestamp: [0, 0.5] }] },
          },
  )
  mocks.prepare.mockResolvedValue({
    audio: new Float32Array(16000),
    durationMs: 1000,
    inputBytes: 64000,
    decodeMs: 1,
    preprocessMs: 1,
  })
})
afterEach(() => vi.unstubAllGlobals())
const file = new File(['video'], 'video.mp4')
it('uses the validated q8 WASM Worker with the completed local File and cleans it up', async () => {
  const result = await transcribeVideo(file, 1000, 'spanish', new AbortController().signal, vi.fn())
  expect(mocks.prepare).toHaveBeenCalledWith(file)
  expect(mocks.request.mock.calls[0][0]).toEqual({ type: 'load', backend: 'wasm' })
  expect(mocks.request.mock.calls[1][0].language).toBe('spanish')
  expect(result.segments).toEqual([{ startMs: 0, endMs: 500, text: 'Hello' }])
  expect(result.selectedLanguage).toBe('spanish')
  expect(result.detectedLanguage).toBeNull()
  expect(mocks.request.mock.calls.at(-1)![0]).toEqual({ type: 'dispose' })
  expect(mocks.terminate).toHaveBeenCalled()
})
it('reports missing audio/native decode failure and terminates without starting inference', async () => {
  mocks.prepare.mockRejectedValue(new Error('EncodingError: cannot decode no-audio file'))
  await expect(
    transcribeVideo(file, 1000, 'english', new AbortController().signal, vi.fn()),
  ).rejects.toThrow('no audio')
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.terminate).toHaveBeenCalled()
})
it('reports initialization failures before attempting audio extraction', async () => {
  mocks.request.mockRejectedValueOnce(new Error('model download failed'))
  await expect(
    transcribeVideo(file, 1000, 'english', new AbortController().signal, vi.fn()),
  ).rejects.toThrow('download')
  expect(mocks.prepare).not.toHaveBeenCalled()
  expect(mocks.terminate).toHaveBeenCalled()
})
it('returns an empty completed result without fabricating speech', async () => {
  mocks.request.mockImplementation(async (request) =>
    request.type === 'load'
      ? { type: 'ready', loadMs: 1 }
      : request.type === 'dispose'
        ? { type: 'disposed' }
        : { type: 'result', inferenceMs: 1, output: { text: '', chunks: [] } },
  )
  const result = await transcribeVideo(file, 1000, 'auto', new AbortController().signal, vi.fn())
  expect(result.status).toBe('completed')
  expect(result.text).toBe('')
  expect(result.segments).toEqual([])
})
it('does not start inference after native decoding completes late following abandonment', async () => {
  const controller = new AbortController()
  mocks.prepare.mockImplementation(async () => {
    controller.abort()
    return { audio: new Float32Array(16000), durationMs: 1000 }
  })
  await expect(
    transcribeVideo(file, 1000, 'auto', controller.signal, vi.fn()),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(mocks.terminate).toHaveBeenCalled()
})
it('refuses to stretch mismatched audio onto a different video duration', async () => {
  await expect(
    transcribeVideo(file, 10000, 'english', new AbortController().signal, vi.fn()),
  ).rejects.toThrow('duration differs')
  expect(mocks.request).toHaveBeenCalledTimes(1)
})

it('reports unavailable browser primitives before model or audio work starts', async () => {
  vi.stubGlobal('Worker', undefined)
  await expect(
    transcribeVideo(file, 1000, 'auto', new AbortController().signal, vi.fn()),
  ).rejects.toThrow('requires HTTPS')
  expect(mocks.request).not.toHaveBeenCalled()
  expect(mocks.prepare).not.toHaveBeenCalled()
})
it('uses shared decoded PCM without detaching the waveform needed by vocal inference', async () => {
  const prepared = {
    audio: new Float32Array(16000).fill(0.2),
    durationMs: 1000,
    decodeMs: 1,
    preprocessMs: 1,
    inputBytes: 64000,
  }
  await transcribeVideo(file, 1000, 'english', new AbortController().signal, vi.fn(), prepared)
  expect(mocks.prepare).not.toHaveBeenCalled()
  const transferred = mocks.request.mock.calls[1][0].audio
  expect(transferred).not.toBe(prepared.audio)
  expect(transferred).toEqual(prepared.audio)
  expect(prepared.audio.length).toBe(16000)
})
