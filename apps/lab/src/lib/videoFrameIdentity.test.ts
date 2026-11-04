import { expect, it } from 'vitest'
import { videoFrameIdentity } from './videoFrameIdentity'

it('prefers a presented-frame count to a coarse timestamp', () => {
  const video = document.createElement('video')
  expect(
    videoFrameIdentity(video, { presentedFrames: 3, mediaTime: 0 } as VideoFrameCallbackMetadata),
  ).toBe('presented:3')
  expect(
    videoFrameIdentity(video, { presentedFrames: 4, mediaTime: 0 } as VideoFrameCallbackMetadata),
  ).toBe('presented:4')
})
it('uses decoded frame counts for the fallback when available', () => {
  const video = document.createElement('video')
  video.getVideoPlaybackQuality = () => ({ totalVideoFrames: 8 }) as VideoPlaybackQuality
  expect(videoFrameIdentity(video)).toBe('decoded:8')
})
it('uses stream time if no frame count is available', () => {
  const video = document.createElement('video')
  video.currentTime = 0.5
  expect(videoFrameIdentity(video)).toBe('time:0.5')
})
