import { describe, expect, it, vi } from 'vitest'
import { resampleMono } from './audio'

describe('verified native resampling', () => {
  it('does not resample already-16k PCM', async () => {
    const audio = new Float32Array([1, -1])
    const create = vi.fn()
    expect(await resampleMono(audio, 16000, create)).toBe(audio)
    expect(create).not.toHaveBeenCalled()
  })
  function mock(rate = 16000, renderedLength = 16000) {
    const input = new Float32Array(48000)
    const output = new Float32Array(renderedLength)
    const source = { buffer: null, connect: vi.fn(), start: vi.fn(), disconnect: vi.fn() }
    const context = {
      destination: {},
      createBuffer: vi.fn(() => ({ getChannelData: () => input })),
      createBufferSource: () => source,
      startRendering: vi.fn(async () => ({
        sampleRate: rate,
        length: renderedLength,
        getChannelData: () => output,
      })),
    }
    const create = vi.fn(() => context as unknown as OfflineAudioContext)
    return { create, context, source, output }
  }
  it('resamples 48k input to verified 16k, preserving duration and source rate', async () => {
    const fixture = mock()
    const result = await resampleMono(new Float32Array(48000), 48000, fixture.create)
    expect(fixture.create).toHaveBeenCalledWith(16000, 16000)
    expect(fixture.context.createBuffer).toHaveBeenCalledWith(1, 48000, 48000)
    expect(result.length / 16000).toBe(1)
    expect(result).not.toBe(fixture.output)
    expect(fixture.source.disconnect).toHaveBeenCalledOnce()
    expect(fixture.source.buffer).toBeNull()
  })
  it('does not assume that requested sample rate or length was honored', async () => {
    await expect(resampleMono(new Float32Array(48000), 48000, mock(44100).create)).rejects.toThrow(
      'verified 16 kHz',
    )
    await expect(
      resampleMono(new Float32Array(48000), 48000, mock(16000, 15999).create),
    ).rejects.toThrow('verified 16 kHz')
  })
  it('rejects invalid source rates and empty audio', async () => {
    await expect(resampleMono(new Float32Array(1), NaN)).rejects.toThrow()
    await expect(resampleMono(new Float32Array(0), 48000)).rejects.toThrow()
  })
})
