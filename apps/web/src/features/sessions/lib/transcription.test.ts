import { expect, it } from 'vitest'
import { parseSessionJSON, serializeSession } from './serialization'
import { sessionFixture } from '../test/fixtures'
import type { SessionTranscription } from '../../speech/types'
const transcript = (): SessionTranscription => ({
  status: 'completed',
  selectedLanguage: 'spanish',
  detectedLanguage: null,
  text: 'Hola mundo',
  segments: [
    { startMs: 100, endMs: 500, text: 'Hola' },
    { startMs: 600, endMs: 900, text: 'mundo' },
  ],
  metadata: {
    modelId: 'onnx-community/whisper-tiny',
    backend: 'wasm',
    inferenceMs: 200,
    loadMs: 300,
    audioDurationMs: 1000,
  },
})
it('explicitly migrates original version 1 without inventing speech data', () => {
  const original = sessionFixture()
  const { transcription: _transcription, facialStatus: _facial, ...legacy } = original
  const migrated = parseSessionJSON(
    JSON.stringify({ schemaVersion: 1, exportedAt: original.createdAt, session: legacy }),
  )
  expect(migrated.samples).toEqual(legacy.samples)
  expect(migrated.transcription).toEqual({
    status: 'not-requested',
    selectedLanguage: 'auto',
    detectedLanguage: null,
    text: '',
    segments: [],
  })
  expect(JSON.parse(serializeSession(migrated)).schemaVersion).toBe(3)
})
it('round-trips both modalities, STT metadata and video-relative milliseconds', () => {
  const session = { ...sessionFixture(), transcription: transcript() }
  expect(parseSessionJSON(serializeSession(session))).toEqual(session)
})
it('accepts speech-only, facial-only and empty completed speech results', () => {
  const session = {
    ...sessionFixture(),
    facialStatus: 'not-requested' as const,
    modelVersion: 'not-run',
    samples: [],
    transcription: transcript(),
  }
  expect(parseSessionJSON(serializeSession(session))).toEqual(session)
  expect(parseSessionJSON(serializeSession(sessionFixture())).transcription?.status).toBe(
    'not-requested',
  )
  session.transcription = { ...transcript(), text: '', segments: [] }
  expect(parseSessionJSON(serializeSession(session)).transcription?.segments).toEqual([])
})
it.each([
  (t: any) => {
    t.segments[0].startMs = -1
  },
  (t: any) => {
    t.segments[0].endMs = 1001
  },
  (t: any) => {
    t.segments[0].endMs = 50
  },
  (t: any) => {
    t.segments[1].startMs = 400
  },
  (t: any) => {
    t.segments.reverse()
  },
  (t: any) => {
    t.segments[0].endMs = null
  },
  (t: any) => {
    t.segments[0].text = ''
  },
  (t: any) => {
    t.segments[0].audio = 'base64'
  },
  (t: any) => {
    t.status = 'pending'
  },
  (t: any) => {
    t.status = 'error'
  },
  (t: any) => {
    t.selectedLanguage = 'french'
  },
  (t: any) => {
    t.metadata.inferenceMs = -1
  },
  (t: any) => {
    t.metadata.backend = 'cloud'
  },
])('rejects malformed imported transcription without repairing it', (mutate) => {
  const data = JSON.parse(serializeSession({ ...sessionFixture(), transcription: transcript() }))
  mutate(data.session.transcription)
  expect(() => parseSessionJSON(JSON.stringify(data))).toThrow()
})
