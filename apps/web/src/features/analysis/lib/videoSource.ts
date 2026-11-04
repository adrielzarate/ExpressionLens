import type { VideoMetadata } from '../types'
import { throwIfAborted } from './abort'

export interface VideoFrameSource {
  metadata: VideoMetadata
  frameAt(timestampMs: number, signal: AbortSignal): Promise<HTMLVideoElement>
  dispose(): void
}
export function validateVideoFile(file: File) {
  const generic = !file.type || file.type === 'application/octet-stream'
  if (!file.size) throw new Error('This video file is empty. Choose a different file.')
  if (!file.type.startsWith('video/') && !(generic && /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)))
    throw new Error('Choose a video file, such as MP4 or WebM supported by your browser.')
}
export function readVideoMetadata(video: HTMLVideoElement): VideoMetadata {
  if (
    !Number.isFinite(video.duration) ||
    video.duration <= 0 ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  )
    throw new Error(
      'Video metadata is unavailable. Choose a video with a readable duration and resolution.',
    )
  return { durationMs: video.duration * 1000, width: video.videoWidth, height: video.videoHeight }
}
export const videoDecodeError =
  'Your browser could not decode this video. It may be damaged or use an unsupported codec. Try another MP4 or WebM file.'

// Listen before changing currentTime/src; paused seeking does not reliably produce
// requestVideoFrameCallback on every browser. seeked + HAVE_CURRENT_DATA are used.
function waitForVideo(
  video: HTMLVideoElement,
  events: string[],
  ready: () => boolean,
  action: () => void,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => {
      clearTimeout(timer)
      for (const name of events) video.removeEventListener(name, check)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const finish = (error?: unknown) => {
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const check = () => {
      if (video.error) failed()
      else if (ready()) finish()
    }
    const failed = () => finish(new Error(videoDecodeError))
    const aborted = () => finish(new DOMException('Analysis cancelled.', 'AbortError'))
    for (const name of events) video.addEventListener(name, check)
    video.addEventListener('error', failed)
    signal.addEventListener('abort', aborted, { once: true })
    timer = setTimeout(
      () => finish(new Error('Timed out waiting for decoded video data. Try another video.')),
      20_000,
    )
    try {
      action()
      check()
    } catch (error) {
      finish(error)
    }
  })
}
// Some native MediaRecorder WebM files omit a duration header. Let the browser
// discover the finite end via seeking; do not rewrite or transcode recorded bytes.
export async function resolveVideoMetadata(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<VideoMetadata> {
  throwIfAborted(signal)
  if (video.duration !== Infinity) return readVideoMetadata(video)
  const originalTime = video.currentTime
  await waitForVideo(
    video,
    ['durationchange', 'timeupdate', 'seeked', 'loadeddata'],
    () => Number.isFinite(video.duration) && video.duration > 0 && video.readyState >= 1,
    () => {
      video.currentTime = 1e10
    },
    signal,
  )
  const metadata = readVideoMetadata(video)
  const target = Math.min(originalTime, metadata.durationMs / 1000)
  const needsRestore = video.seeking || Math.abs(video.currentTime - target) >= 0.001
  let restored = !needsRestore
  const markRestored = () => {
    restored = true
  }
  video.addEventListener('seeked', markRestored)
  try {
    await waitForVideo(
      video,
      ['seeked', 'loadeddata', 'canplay'],
      () => restored && !video.seeking && video.readyState >= 2,
      () => {
        if (needsRestore) video.currentTime = target
      },
      signal,
    )
  } finally {
    video.removeEventListener('seeked', markRestored)
  }
  return metadata
}

export async function createVideoSource(
  url: string,
  signal: AbortSignal,
): Promise<VideoFrameSource> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('aria-hidden', 'true')
  video.tabIndex = -1
  video.className = 'analysis-decoder'
  // Keep a real attached media element for mobile decoders, independent of preview.
  document.body.append(video)
  const dispose = () => {
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
  }
  try {
    await waitForVideo(
      video,
      ['loadedmetadata', 'loadeddata', 'canplay', 'durationchange'],
      () => video.readyState >= 2 && video.duration > 0,
      () => {
        video.src = url
        video.load()
      },
      signal,
    )
    const metadata = await resolveVideoMetadata(video, signal)
    return {
      metadata,
      async frameAt(timestampMs, frameSignal) {
        const target = timestampMs / 1000
        if (!Number.isFinite(target) || target < 0 || timestampMs >= metadata.durationMs)
          throw new Error('Requested video timestamp is out of range.')
        const needsSeek = Math.abs(video.currentTime - target) >= 0.001
        let seekConfirmed = !needsSeek
        const markSeeked = () => {
          seekConfirmed = true
        }
        video.addEventListener('seeked', markSeeked)
        try {
          await waitForVideo(
            video,
            ['seeked', 'loadeddata', 'canplay'],
            () => seekConfirmed && !video.seeking && video.readyState >= 2,
            () => {
              if (needsSeek) video.currentTime = target
            },
            frameSignal,
          )
        } finally {
          video.removeEventListener('seeked', markSeeked)
        }
        throwIfAborted(frameSignal)
        return video
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
