import type { ExpressionSample } from '../types'
import { throwIfAborted } from './abort'

export interface FrameAnalyzer {
  modelVersion: string
  analyze(video: HTMLVideoElement, timestampMs: number): Promise<ExpressionSample>
  dispose(): void
}
export async function createAnalyzer(signal: AbortSignal): Promise<FrameAnalyzer> {
  // Load SDK/runtime code only when Analyze is requested, never for preview alone.
  const shared = await import('@expressionlens/classifier')
  throwIfAborted(signal)
  let face: Awaited<ReturnType<typeof shared.createFaceLandmarker>> | null = null
  let classifier: Awaited<ReturnType<typeof shared.loadDefaultClassifier>> | null = null
  let stage = 'facial landmark model'
  try {
    face = await shared.createFaceLandmarker({ runningMode: 'VIDEO', numFaces: 2 })
    throwIfAborted(signal)
    stage = 'expression classifier v3'
    classifier = await shared.loadDefaultClassifier()
    throwIfAborted(signal)
    const detector = face,
      network = classifier
    return {
      modelVersion: 'v3',
      async analyze(video, timestampMs) {
        const result = detector.detectForVideo(video, timestampMs)
        if (!result.faceLandmarks.length) return { status: 'no-face', timestampMs }
        if (result.faceLandmarks.length > 1) return { status: 'multiple-faces', timestampMs }
        const shapes = (result.faceBlendshapes[0]?.categories ?? []).map((row) => ({
          name: row.categoryName,
          score: row.score,
        }))
        const prediction = await shared.inferExpression(network, shapes)
        return { status: 'detected', timestampMs, ...prediction }
      },
      dispose() {
        try {
          network.dispose()
        } finally {
          detector.close()
        }
      },
    }
  } catch (error) {
    classifier?.dispose()
    face?.close()
    throwIfAborted(signal)
    throw new Error(
      `Could not initialize the ${stage}. ${error instanceof Error ? error.message : 'Try again.'}`,
    )
  }
}
