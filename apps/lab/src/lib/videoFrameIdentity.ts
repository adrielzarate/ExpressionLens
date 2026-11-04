// Use a frame counter when available. Stream timelines can have coarse or
// repeated timestamps; a new presented frame is still a new camera sample.
export function videoFrameIdentity(
  video: HTMLVideoElement,
  metadata?: VideoFrameCallbackMetadata,
): string {
  if (metadata && Number.isFinite(metadata.presentedFrames) && metadata.presentedFrames > 0) {
    return `presented:${metadata.presentedFrames}`
  }
  if (metadata && Number.isFinite(metadata.mediaTime)) return `time:${metadata.mediaTime}`
  const decoded = video.getVideoPlaybackQuality?.().totalVideoFrames
  if (decoded && Number.isFinite(decoded)) return `decoded:${decoded}`
  return `time:${video.currentTime}`
}
