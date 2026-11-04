import { afterEach, expect, it, vi } from 'vitest'
import { prepareAudio } from '../../features/speech/lib/audio'
import { mixToMono } from '../../features/speech/lib/core'
afterEach(() => vi.unstubAllGlobals())
it('reuses native channel mixing without Whisper spectral preprocessing', () => {
  expect([...mixToMono([new Float32Array([0.5, -0.5]), new Float32Array([-0.5, 0.5])])]).toEqual([
    0, 0,
  ])
})
it('closes the native decoder on missing/unsupported audio', async () => {
  const close = vi.fn(async () => {}),
    decodeAudioData = vi.fn(async () => {
      throw new DOMException('No audio track', 'EncodingError')
    })
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close
      decodeAudioData = decodeAudioData
    },
  )
  const file = new File(['bytes'], 'silent-video.mp4')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(5) })
  await expect(prepareAudio(file)).rejects.toThrow('No audio')
  expect(close).toHaveBeenCalledOnce()
})
it('preserves a valid decoded 16k PCM time origin and closes the context', async () => {
  const channel = Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i * 0.1) * 0.2),
    close = vi.fn(async () => {})
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close
      async decodeAudioData() {
        return {
          length: 16000,
          sampleRate: 16000,
          numberOfChannels: 1,
          getChannelData: () => channel,
        }
      }
    },
  )
  const file = new File(['bytes'], 'speech.wav')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(5) })
  const result = await prepareAudio(file)
  expect(result.durationMs).toBe(1000)
  expect(result.audio).toEqual(channel)
  expect(result.audio.length).toBe(16000)
  expect(close).toHaveBeenCalledOnce()
})
