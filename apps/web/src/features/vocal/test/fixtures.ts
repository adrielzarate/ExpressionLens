import { vocalModels } from '../models'
import type { SessionVocal } from '../types'
import manifest from '../assets.json'
export function vocalFixture(): SessionVocal {
  return {
    status: 'completed',
    samples: [
      {
        startMs: 0,
        endMs: 500,
        predictedLabel: 'hap',
        scores: { neu: 0.1, hap: 0.7, ang: 0.1, sad: 0.1 },
        margin: 0.6,
        status: 'classified',
      },
      {
        startMs: 500,
        endMs: 1000,
        predictedLabel: null,
        scores: {},
        margin: null,
        status: 'silent',
      },
    ],
    metadata: {
      modelId: manifest.modelId,
      revision: manifest.revision,
      dtype: 'q4',
      backend: 'wasm',
      labels: ['neu', 'hap', 'ang', 'sad'],
      sampleRate: 16000,
      windowSeconds: 5,
      stepMs: 5000,
      overlapMs: 0,
      silenceRms: 0.0001,
      audioDurationMs: 1000,
      loadMs: 10,
      inferenceMs: 20,
    },
  }
}

// Separate fixture: never overwrite or reinterpret the legacy Wav2Vec2 fixture.
export function emotionVocalFixture(): SessionVocal {
  const model = vocalModels.emotion2vec
  const scores = Object.fromEntries(
    model.labels.map((label) => [label, label === 'angry' ? 0.6 : 0.05]),
  )
  return {
    ...vocalFixture(),
    metadata: {
      ...vocalFixture().metadata!,
      modelId: model.manifest.modelId,
      revision: model.manifest.revision,
      dtype: model.dtype,
      labels: [...model.labels],
      preprocessing: model.preprocessing,
      windowSeconds: 3,
      stepMs: 3000,
    },
    samples: [
      {
        startMs: 0,
        endMs: 500,
        predictedLabel: 'angry',
        scores,
        margin: 0.55,
        status: 'classified',
      },
      { ...vocalFixture().samples[1] },
    ],
  }
}
