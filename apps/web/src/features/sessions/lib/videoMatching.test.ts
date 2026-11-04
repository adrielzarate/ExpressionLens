import { expect, it } from 'vitest'
import { describeVideo, VIDEO_DURATION_TOLERANCE_MS, videoDifferences } from './videoMatching'
import { sessionFixture } from '../test/fixtures'
it('matches available metadata with inclusive browser duration tolerance', () => {
  const expected = sessionFixture().video!
  const file = new File(['video'], 'interview.mp4', { type: 'video/mp4' })
  expect(
    videoDifferences(expected, describeVideo(file, { durationMs: 1000, width: 640, height: 480 })),
  ).toEqual([])
  expect(
    videoDifferences(expected, { ...expected, durationMs: 1000 + VIDEO_DURATION_TOLERANCE_MS }),
  ).toEqual([])
  expect(videoDifferences(expected, { ...expected, durationMs: 1251 })).toEqual([
    'Duration differs by more than 250 ms.',
  ])
})
it('does not treat a matching filename as proof of identical video metadata', () => {
  const expected = sessionFixture().video!
  expect(videoDifferences(expected, { ...expected, sizeBytes: 100, width: 800 })).toEqual([
    'File size differs.',
    'Resolution differs.',
  ])
  expect(videoDifferences(expected, { ...expected, filename: 'other.mp4' })).toEqual([
    'Filename differs.',
  ])
})
it('matches a downloaded recording when the browser omits MIME codec parameters', () => {
  const expected = { ...sessionFixture().video!, mimeType: 'video/webm;codecs=vp8,opus' }
  expect(videoDifferences(expected, { ...expected, mimeType: 'video/webm' })).toEqual([])
})
