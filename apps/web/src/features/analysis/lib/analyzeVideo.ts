import type { AnalysisProgress, AnalysisSession } from '../types'
import { createVideoSource } from './videoSource'
import { createAnalyzer } from './analyzer'
import { ANALYSIS_FPS, samplingPlan } from './sampling'
import { throwIfAborted, isAbortError } from './abort'

export interface AnalysisDependencies {
  createSource: typeof createVideoSource
  createAnalyzer: typeof createAnalyzer
  yieldControl: () => Promise<void>
}
const defaults: AnalysisDependencies = {
  createSource: createVideoSource,
  createAnalyzer,
  yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
}
export async function analyzeVideo(
  url: string,
  signal: AbortSignal,
  onProgress: (progress: AnalysisProgress) => void,
  fps = ANALYSIS_FPS,
  deps = defaults,
): Promise<AnalysisSession> {
  let source: Awaited<ReturnType<typeof createVideoSource>> | null = null
  let analyzer: Awaited<ReturnType<typeof createAnalyzer>> | null = null
  try {
    throwIfAborted(signal)
    source = await deps.createSource(url, signal)
    throwIfAborted(signal)
    const plan = samplingPlan(source.metadata.durationMs, fps)
    analyzer = await deps.createAnalyzer(signal)
    throwIfAborted(signal)
    const session: AnalysisSession = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source: 'upload',
      durationMs: source.metadata.durationMs,
      modelVersion: analyzer.modelVersion,
      samplingFps: fps,
      samples: [],
    }
    for (let index = 0; index < plan.totalFrames; index++) {
      const timestampMs = plan.timestampAt(index)
      throwIfAborted(signal)
      onProgress({ processedFrames: index, totalFrames: plan.totalFrames, timestampMs })
      const frame = await source.frameAt(timestampMs, signal)
      throwIfAborted(signal)
      const sample = await analyzer.analyze(frame, timestampMs)
      throwIfAborted(signal)
      session.samples.push(sample)
      onProgress({ processedFrames: index + 1, totalFrames: plan.totalFrames, timestampMs })
      await deps.yieldControl()
    }
    throwIfAborted(signal)
    return session
  } catch (error) {
    if (isAbortError(error) || signal.aborted)
      throw new DOMException('Analysis cancelled.', 'AbortError')
    throw new Error(
      `Video analysis failed. ${error instanceof Error ? error.message : 'Try another video.'}`,
    )
  } finally {
    // Only dispose after a pending inference/initialization settles.
    try {
      analyzer?.dispose()
    } finally {
      source?.dispose()
    }
  }
}
