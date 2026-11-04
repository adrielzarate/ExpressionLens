import { afterEach, expect, it, vi } from 'vitest'
import {
  downloadRecording,
  recordingExtension,
  recordingFile,
  RECORDING_LIMIT_MS,
  selectRecordingMime,
} from './formats'
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('negotiates an audio-capable supported container and otherwise uses the browser default', () => {
  expect(
    selectRecordingMime({
      isTypeSupported: (type: string) => type === 'video/mp4',
    } as Pick<typeof MediaRecorder, 'isTypeSupported'>),
  ).toBe('video/mp4')
  expect(
    selectRecordingMime({ isTypeSupported: () => false } as unknown as Pick<
      typeof MediaRecorder,
      'isTypeSupported'
    >),
  ).toBeUndefined()
  expect(RECORDING_LIMIT_MS).toBe(600000)
})
it('preserves the concatenated recorded bytes and derives the actual file extension', async () => {
  const file = await recordingFile(
    [new Blob(['one'], { type: 'video/mp4' }), new Blob(['two'], { type: 'video/mp4' })],
    'video/webm',
  )
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
  expect(text).toBe('onetwo')
  expect(file.size).toBe(6)
  expect(file.type).toBe('video/mp4')
  expect(file.name).toMatch(/\.mp4$/)
  expect(recordingExtension('video/webm;codecs=vp8,opus')).toBe('webm')
  expect(recordingExtension('unknown')).toBe('bin')
})
it('identifies a default MP4 by its header when the browser omits MIME information', async () => {
  const file = await recordingFile(
    [new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 2, 3])])],
    '',
  )
  expect(file.type).toBe('video/mp4')
  expect(file.name).toMatch(/\.mp4$/)
})
it('downloads the same recording with its actual filename and releases the temporary URL', async () => {
  vi.useFakeTimers()
  const file = await recordingFile([new Blob(['bytes'], { type: 'video/webm' })], 'video/webm')
  const create = vi.fn((_blob: Blob) => 'blob:download'),
    revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toBe(file.name)
  })
  downloadRecording(file)
  expect(create).toHaveBeenCalledWith(file)
  vi.advanceTimersByTime(10_000)
  expect(revoke).toHaveBeenCalledWith('blob:download')
})
