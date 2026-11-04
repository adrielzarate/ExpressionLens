export const ANALYSIS_FPS = 5

export function samplingPlan(durationMs: number, fps = ANALYSIS_FPS) {
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw new Error('A video with a finite, positive duration is required.')
  if (!Number.isFinite(fps) || fps <= 0 || fps > 60)
    throw new Error('Sampling rate must be greater than 0 and at most 60 FPS.')
  const totalFrames = Math.ceil((durationMs * fps) / 1000)
  if (!Number.isSafeInteger(totalFrames))
    throw new Error('Video duration exceeds the supported range.')
  return { totalFrames, timestampAt: (index: number) => (index * 1000) / fps }
}
