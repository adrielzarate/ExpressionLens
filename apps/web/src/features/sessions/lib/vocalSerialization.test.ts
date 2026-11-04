import { expect, it } from 'vitest'
import { parseSessionJSON, serializeSession } from './serialization'
import { sessionFixture } from '../test/fixtures'
import { vocalFixture } from '../../vocal/test/fixtures'
it('round trips v3 with original facial, transcript, vocal scores and selected analyses', () => {
  const original = {
    ...sessionFixture(),
    vocal: vocalFixture(),
    selectedAnalyses: { facial: true, speech: false, vocal: true },
  }
  const json = serializeSession(original)
  expect(JSON.parse(json).schemaVersion).toBe(3)
  expect(parseSessionJSON(json)).toEqual(original)
  expect(json).not.toMatch(/audioBuffer|weights|blob:/)
})
it('imports v2 without vocal data and reexports as v3 without inventing predictions', () => {
  const original = sessionFixture()
  const imported = parseSessionJSON(
    JSON.stringify({ schemaVersion: 2, exportedAt: original.createdAt, session: original }),
  )
  expect(imported).toEqual(original)
  expect(imported.vocal).toBeUndefined()
  expect(JSON.parse(serializeSession(imported)).schemaVersion).toBe(3)
})
it.each([
  (v: any) => {
    v.samples[0].scores.hap = 0.1
  },
  (v: any) => {
    v.samples[0].predictedLabel = 'ang'
  },
  (v: any) => {
    v.samples[0].margin = null
  },
  (v: any) => {
    v.samples[1].scores = { neu: 1 }
  },
  (v: any) => {
    v.samples[1].startMs = 100
  },
  (v: any) => {
    v.samples[1].endMs = 1001
  },
  (v: any) => {
    v.samples[0].audio = 'base64'
  },
  (v: any) => {
    v.metadata.labels.reverse()
  },
  (v: any) => {
    v.metadata.backend = 'webgpu'
  },
  (v: any) => {
    v.metadata.windowSeconds = '5'
  },
  (v: any) => {
    v.metadata.stepMs = 2000
  },
  (v: any) => {
    v.status = 'partial'
  },
  (v: any) => {
    delete v.metadata
  },
])('rejects incompatible or corrupt vocal data without recomputing predictions', (mutate) => {
  const data = JSON.parse(serializeSession({ ...sessionFixture(), vocal: vocalFixture() }))
  mutate(data.session.vocal)
  expect(() => parseSessionJSON(JSON.stringify(data))).toThrow()
})
it('preserves explicit failed intervals as partial results and handles vocal-only sessions', () => {
  const vocal = vocalFixture()
  vocal.status = 'partial'
  vocal.error = 'One failed window'
  vocal.samples[1] = {
    ...vocal.samples[1],
    status: 'failed',
    error: 'Inference failed\nadditional context',
  }
  const session = {
    ...sessionFixture(),
    samples: [],
    modelVersion: 'not-run',
    facialStatus: 'not-requested' as const,
    vocal,
    selectedAnalyses: { facial: false, speech: false, vocal: true },
  }
  expect(parseSessionJSON(serializeSession(session))).toEqual(session)
})
it('rejects empty selections and strips runtime extras on export', () => {
  expect(() =>
    serializeSession({
      ...sessionFixture(),
      selectedAnalyses: { facial: false, speech: false, vocal: false },
    }),
  ).toThrow()
  const vocal = { ...vocalFixture(), audio: new Float32Array(100) }
  expect(serializeSession({ ...sessionFixture(), vocal })).not.toContain('Float32Array')
  expect(
    JSON.parse(serializeSession({ ...sessionFixture(), vocal })).session.vocal.audio,
  ).toBeUndefined()
})
it('round trips all nine Emotion2vec scores and provenance without mapping to four Wav2Vec2 categories', async () => {
  const { emotionVocalFixture } = await import('../../vocal/test/fixtures')
  const original = { ...sessionFixture(), vocal: emotionVocalFixture() }
  const json = serializeSession(original),
    restored = parseSessionJSON(json)
  expect(restored).toEqual(original)
  expect(restored.vocal?.metadata?.dtype).toBe('fp32')
  expect(Object.keys(restored.vocal!.samples[0].scores)).toHaveLength(9)
  expect(restored.vocal!.samples[0].predictedLabel).toBe('angry')
  expect(restored.vocal!.samples[0].scores.ang).toBeUndefined()
})
it('rejects cross-model labels, precision and preprocessing instead of reinterpreting old sessions', async () => {
  const { emotionVocalFixture } = await import('../../vocal/test/fixtures')
  const { vocalModels } = await import('../../vocal/models')
  const original = { ...sessionFixture(), vocal: emotionVocalFixture() }
  for (const patch of [
    { labels: ['neu', 'hap', 'ang', 'sad'] },
    { dtype: 'q4' },
    { preprocessing: vocalModels.wav2vec2.preprocessing },
    { modelId: vocalModels.wav2vec2.manifest.modelId },
  ]) {
    const data = JSON.parse(serializeSession(original))
    Object.assign(data.session.vocal.metadata, patch)
    expect(() => parseSessionJSON(JSON.stringify(data))).toThrow()
  }
  // The active Emotion2vec configuration cannot alter the original Wav2Vec2 output.
  const old = { ...sessionFixture(), vocal: vocalFixture() }
  expect(parseSessionJSON(serializeSession(old))).toEqual(old)
})
