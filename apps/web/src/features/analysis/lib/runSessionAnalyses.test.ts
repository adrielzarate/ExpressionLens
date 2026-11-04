import { expect, it, vi } from 'vitest'
import { runSessionAnalyses } from './runSessionAnalyses'
import { sessionFixture } from '../../sessions/test/fixtures'
import { emptyTranscription } from '../../speech/types'
import type { SessionTranscription } from '../../speech/types'
const speech: SessionTranscription = {
  ...emptyTranscription('english'),
  status: 'completed',
  text: 'hello',
  segments: [{ startMs: 0, endMs: 500, text: 'hello' }],
}
const options = {
  facial: true,
  speech: true,
  language: 'english' as const,
  file: new File(['video'], 'video.mp4'),
}
it('runs modalities sequentially, publishes facial success before speech and associates both with one identity', async () => {
  const original = sessionFixture(),
    published = vi.fn(),
    order: string[] = []
  const result = await runSessionAnalyses(
    'blob:video',
    original.video!,
    'live',
    options,
    null,
    new AbortController().signal,
    published,
    vi.fn(),
    vi.fn(),
    {
      facial: vi.fn(async () => {
        order.push('facial')
        return original
      }),
      speech: vi.fn(async () => {
        expect(published.mock.calls[0][0].samples).toEqual(original.samples)
        order.push('speech')
        return speech
      }),
    },
  )
  expect(order).toEqual(['facial', 'speech'])
  expect(result.source).toBe('live')
  expect(result.samples).toEqual(original.samples)
  expect(result.transcription).toEqual(speech)
  expect(published.mock.calls[0][0].id).toBe(result.id)
})
it('preserves facial samples after missing-audio failure, and speech after facial failure', async () => {
  const original = sessionFixture()
  const result = await runSessionAnalyses(
    '',
    original.video!,
    'upload',
    options,
    null,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    {
      facial: vi.fn(async () => original),
      speech: vi.fn(async () => {
        throw new Error('Audio decoding failed: no audio track')
      }),
    },
  )
  expect(result.samples).toEqual(original.samples)
  expect(result.transcription?.status).toBe('error')
  const recovered = await runSessionAnalyses(
    '',
    original.video!,
    'upload',
    options,
    null,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    {
      facial: vi.fn(async () => {
        throw new Error('facial model unavailable')
      }),
      speech: vi.fn(async () => speech),
    },
  )
  expect(recovered.facialStatus).toBe('error')
  expect(recovered.transcription).toEqual(speech)
})
it('preserves transcript and session identity when facial is rerun, and facial samples when speech is retried', async () => {
  const original = { ...sessionFixture(), transcription: speech }
  const deps = {
    facial: vi.fn(async () => ({ ...sessionFixture(), id: 'different-inference-job' })),
    speech: vi.fn(async () => ({ ...speech, text: 'retry' })),
  }
  const facial = await runSessionAnalyses(
    '',
    original.video!,
    'upload',
    { ...options, speech: false },
    original,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    deps,
  )
  expect(facial.id).toBe(original.id)
  expect(facial.transcription).toEqual(speech)
  expect(deps.speech).not.toHaveBeenCalled()
  deps.facial.mockClear()
  const retried = await runSessionAnalyses(
    '',
    original.video!,
    'upload',
    { ...options, facial: false },
    original,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    deps,
  )
  expect(retried.samples).toEqual(original.samples)
  expect(retried.transcription?.text).toBe('retry')
  expect(deps.facial).not.toHaveBeenCalled()
})
it('keeps a previous successful transcript if retry fails or is abandoned', async () => {
  const original = { ...sessionFixture(), transcription: speech }
  const result = await runSessionAnalyses(
    '',
    original.video!,
    'upload',
    { ...options, facial: false },
    original,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    {
      facial: vi.fn(),
      speech: vi.fn(async () => {
        throw new Error('model download failed')
      }),
    },
  )
  expect(result.transcription?.text).toBe('hello')
  expect(result.transcription?.error).toContain('download failed')
})
it('does not start speech after cancellation during facial processing', async () => {
  const controller = new AbortController(),
    original = sessionFixture(),
    speechMock = vi.fn()
  await expect(
    runSessionAnalyses(
      '',
      original.video!,
      'upload',
      options,
      null,
      controller.signal,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      {
        facial: vi.fn(async () => {
          controller.abort()
          return original
        }),
        speech: speechMock,
      },
    ),
  ).rejects.toThrow()
  expect(speechMock).not.toHaveBeenCalled()
})

it('decodes only once for speech + vocal, keeps models sequential and retains both successful outputs', async () => {
  const { vocalFixture } = await import('../../vocal/test/fixtures')
  const prepared = {
    audio: new Float32Array(16000),
    durationMs: 1000,
    decodeMs: 1,
    preprocessMs: 1,
    inputBytes: 64000,
  }
  const order: string[] = []
  const deps = {
    facial: vi.fn(async () => {
      order.push('face')
      return sessionFixture()
    }),
    audio: vi.fn(async () => {
      order.push('decode')
      return prepared
    }),
    speech: vi.fn(async (...args: unknown[]) => {
      expect(args[5]).toBe(prepared)
      order.push('speech')
      return speech
    }),
    vocal: vi.fn(async (...args: unknown[]) => {
      expect(args[4]).toBe(prepared)
      order.push('vocal')
      return vocalFixture()
    }),
  }
  const result = await runSessionAnalyses(
    '',
    sessionFixture().video!,
    'live',
    { ...options, vocal: true },
    null,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    deps,
  )
  expect(order).toEqual(['face', 'decode', 'speech', 'vocal'])
  expect(deps.audio).toHaveBeenCalledOnce()
  expect(result.vocal?.samples).toHaveLength(2)
  expect(result.transcription).toEqual(speech)
  expect(result.selectedAnalyses).toEqual({ facial: true, speech: true, vocal: true })
})
it('retains facial and transcription results when vocal model loading fails', async () => {
  const result = await runSessionAnalyses(
    '',
    sessionFixture().video!,
    'upload',
    { ...options, vocal: true },
    null,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    {
      facial: vi.fn(async () => sessionFixture()),
      audio: vi.fn(async () => ({
        audio: new Float32Array(16000),
        durationMs: 1000,
        decodeMs: 0,
        preprocessMs: 0,
        inputBytes: 64000,
      })),
      speech: vi.fn(async () => speech),
      vocal: vi.fn(async () => {
        throw new Error('Vocal model unavailable')
      }),
    },
  )
  expect(result.vocal?.status).toBe('error')
  expect(result.vocal?.samples).toEqual([])
  expect(result.transcription).toEqual(speech)
  expect(result.samples).toEqual(sessionFixture().samples)
})
it('marks both audio failures explicitly after one failed decode while retaining facial results', async () => {
  const audio = vi.fn(async () => {
    throw new Error('Missing audio track')
  })
  const vocal = vi.fn(),
    speechMock = vi.fn()
  const result = await runSessionAnalyses(
    '',
    sessionFixture().video!,
    'upload',
    { ...options, vocal: true },
    null,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    { facial: vi.fn(async () => sessionFixture()), audio, speech: speechMock, vocal },
  )
  expect(audio).toHaveBeenCalledOnce()
  expect(vocal).not.toHaveBeenCalled()
  expect(speechMock).not.toHaveBeenCalled()
  expect(result.transcription?.status).toBe('error')
  expect(result.vocal?.status).toBe('error')
  expect(result.samples).toEqual(sessionFixture().samples)
})
it('never starts vocal inference after cancellation of speech', async () => {
  const controller = new AbortController(),
    vocal = vi.fn()
  await expect(
    runSessionAnalyses(
      '',
      sessionFixture().video!,
      'upload',
      { ...options, vocal: true },
      null,
      controller.signal,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      {
        facial: vi.fn(async () => sessionFixture()),
        audio: vi.fn(async () => ({
          audio: new Float32Array(16000),
          durationMs: 1000,
          decodeMs: 0,
          preprocessMs: 0,
          inputBytes: 64000,
        })),
        speech: vi.fn(async () => {
          controller.abort()
          return speech
        }),
        vocal,
      },
    ),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(vocal).not.toHaveBeenCalled()
})
it('supports vocal-only analysis without invoking face or speech', async () => {
  const { vocalFixture } = await import('../../vocal/test/fixtures')
  const facial = vi.fn(),
    speechMock = vi.fn(),
    audio = vi.fn()
  const result = await runSessionAnalyses(
    '',
    sessionFixture().video!,
    'upload',
    { ...options, facial: false, speech: false, vocal: true },
    null,
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    { facial, speech: speechMock, audio, vocal: vi.fn(async () => vocalFixture()) },
  )
  expect(facial).not.toHaveBeenCalled()
  expect(speechMock).not.toHaveBeenCalled()
  expect(audio).not.toHaveBeenCalled()
  expect(result.facialStatus).toBe('not-requested')
  expect(result.vocal?.status).toBe('completed')
})
