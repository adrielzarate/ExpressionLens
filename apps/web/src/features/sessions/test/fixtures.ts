import { emptyTranscription } from '../../speech/types'
import type { AnalysisSession, ExpressionSample } from '../../analysis/types'
export function detected(
  timestampMs: number,
  kind: 'uncertain' | 'smile' | 'angry' = 'uncertain',
): ExpressionSample {
  const values =
    kind === 'uncertain'
      ? [0.550123456789, 0.008, 0.002, 0.439876543211]
      : kind === 'smile'
        ? [0.02, 0.94, 0.01, 0.03]
        : [0.1, 0.01, 0.01, 0.88]
  const rawLabel = kind === 'uncertain' ? 'neutral' : kind
  const ranked = [...values].sort((a, b) => b - a)
  return {
    status: 'detected',
    timestampMs,
    label: kind,
    rawLabel,
    isUncertain: kind === 'uncertain',
    confidence: ranked[0],
    margin: ranked[0] - ranked[1],
    distribution: [
      { label: 'neutral', probability: values[0] },
      { label: 'smile', probability: values[1] },
      { label: 'surprise', probability: values[2] },
      { label: 'angry', probability: values[3] },
    ],
  }
}
export function sessionFixture(): AnalysisSession {
  return {
    id: 'portable-session',
    createdAt: '2026-11-03T12:00:00.000Z',
    source: 'upload',
    modelVersion: 'v3',
    durationMs: 1000,
    samplingFps: 5,
    facialStatus: 'completed',
    transcription: emptyTranscription(),
    video: {
      filename: 'interview.mp4',
      sizeBytes: 5,
      durationMs: 1000,
      width: 640,
      height: 480,
      mimeType: 'video/mp4',
    },
    samples: [
      detected(0),
      { status: 'no-face', timestampMs: 200 },
      { status: 'multiple-faces', timestampMs: 400 },
      detected(600, 'smile'),
      detected(800, 'angry'),
    ],
  }
}
