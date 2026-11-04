import { describe, expect, it } from 'vitest'
import {
  describeError,
  detectCapabilities,
  mixToMono,
  normalizeTranscript,
  realTimeFactor,
} from './core'
import type { CapabilityHost } from './core'

describe('local audio channels', () => {
  it('preserves mono and averages stereo without concatenating channels', () => {
    expect([...mixToMono([new Float32Array([1, -1])])]).toEqual([1, -1])
    expect([...mixToMono([new Float32Array([1, 0]), new Float32Array([-1, 1])])]).toEqual([0, 0.5])
  })
  it('averages all channels and rejects invalid decoded buffers', () => {
    expect([
      ...mixToMono([new Float32Array([0.25]), new Float32Array([0.5]), new Float32Array([0.75])]),
    ]).toEqual([0.5])
    expect(() => mixToMono([])).toThrow()
    expect(() => mixToMono([new Float32Array([1]), new Float32Array(2)])).toThrow()
    expect(() => mixToMono([new Float32Array([NaN])])).toThrow()
  })
})
describe('model timestamps', () => {
  it('normalizes seconds to ms without changing full text', () => {
    expect(
      normalizeTranscript(
        {
          text: ' Hello world ',
          chunks: [
            { text: ' Hello ', timestamp: [2.4, 5.1] },
            { text: 'world', timestamp: [5.2, 8.9] },
          ],
        },
        10000,
      ),
    ).toEqual({
      text: 'Hello world',
      segments: [
        { text: 'Hello', startMs: 2400, endMs: 5100 },
        { text: 'world', startMs: 5200, endMs: 8900 },
      ],
    })
  })
  it('applies an explicit chunk offset once relative to the original timeline', () => {
    expect(
      normalizeTranscript(
        { text: 'Next', chunks: [{ text: 'Next', timestamp: [1, 3] }] },
        60000,
        20000,
      ).segments,
    ).toEqual([{ startMs: 21000, endMs: 23000, text: 'Next' }])
  })
  it.each([
    [null, 3],
    [1, null],
    [-1, 3],
    [3, 2],
    [2, 2],
    [0, Infinity],
    [0, 11],
  ])('keeps text but refuses fabricated bounds %s – %s', (start, end) => {
    const result = normalizeTranscript(
      { text: 'Keep text', chunks: [{ text: 'Keep text', timestamp: [start, end] }] },
      10000,
    )
    expect(result.text).toBe('Keep text')
    expect(result.segments).toEqual([])
    expect(result.timestampWarning).toBeTruthy()
  })
  it('rejects overlapping, unordered and missing timestamps', () => {
    for (const chunks of [
      undefined,
      [],
      [
        { text: 'a', timestamp: [1, 4] },
        { text: 'b', timestamp: [3, 5] },
      ],
      [
        { text: 'a', timestamp: [4, 5] },
        { text: 'b', timestamp: [1, 2] },
      ],
    ]) {
      expect(normalizeTranscript({ text: 'a b', chunks }, 10000).timestampWarning).toBeTruthy()
    }
  })
  it('retains gaps and repeated speech when timestamps are valid', () => {
    const result = normalizeTranscript(
      {
        text: 'yes yes',
        chunks: [
          { text: 'yes', timestamp: [0, 1] },
          { text: 'yes', timestamp: [2, 3] },
        ],
      },
      3000,
    )
    expect(result.segments).toHaveLength(2)
  })
  it('rejects malformed results and offsets', () => {
    expect(() => normalizeTranscript({}, 10000)).toThrow()
    expect(() => normalizeTranscript({ text: 'a' }, 10000, -1)).toThrow()
  })
})
it('calculates RTF using inference only, and rejects invalid timings', () => {
  expect(realTimeFactor(15000, 30000)).toBe(0.5)
  expect(realTimeFactor(60000, 30000)).toBe(2)
  expect(realTimeFactor(0, 30000)).toBe(0)
  expect(realTimeFactor(1000, 0)).toBeNull()
  expect(realTimeFactor(NaN, 30000)).toBeNull()
  expect(realTimeFactor(-1, 30000)).toBeNull()
})
describe('capabilities and errors without hardware', () => {
  const supported = {
    isSecureContext: true,
    Worker: {},
    WebAssembly: {},
    AudioContext: {},
    OfflineAudioContext: {},
    navigator: {},
  } satisfies CapabilityHost
  it('selects WASM without assuming a GPU exists', async () => {
    expect(await detectCapabilities(supported)).toMatchObject({ wasm: true, webgpu: false })
    expect(await detectCapabilities({ ...supported, isSecureContext: false })).toMatchObject({
      wasm: false,
      webgpu: false,
    })
    expect(await detectCapabilities({ ...supported, AudioContext: undefined })).toMatchObject({
      wasm: false,
    })
  })
  it('probes an adapter, handling rejection or absence', async () => {
    expect(
      await detectCapabilities({
        ...supported,
        navigator: { gpu: { requestAdapter: async () => ({}) } },
      }),
    ).toMatchObject({ webgpu: true })
    expect(
      await detectCapabilities({
        ...supported,
        navigator: { gpu: { requestAdapter: async () => null } },
      }),
    ).toMatchObject({ webgpu: false })
    expect(
      await detectCapabilities({
        ...supported,
        navigator: {
          gpu: {
            requestAdapter: async () => {
              throw new Error('denied')
            },
          },
        },
      }),
    ).toMatchObject({ wasm: true, webgpu: false })
  })
  it('gives actionable decode, memory and backend/download errors', () => {
    expect(describeError(new Error('EncodingError: decode failed'))).toContain('codec')
    expect(describeError(new Error('out of memory'))).toContain('shorter file')
    expect(describeError(new Error('fetch failed'))).toContain('local Whisper assets')
    expect(describeError(new Error('unsupported GPU operator'))).toContain('WASM')
  })
})
