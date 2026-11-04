import type { SessionVideoMetadata, VideoMetadata } from '../../analysis/types'

export const VIDEO_DURATION_TOLERANCE_MS = 250
export function describeVideo(file: File, metadata: VideoMetadata): SessionVideoMetadata {
  return {
    filename: file.name,
    sizeBytes: file.size,
    ...metadata,
    ...(file.type ? { mimeType: file.type } : {}),
  }
}
export function videoDifferences(
  expected: SessionVideoMetadata,
  actual: SessionVideoMetadata,
): string[] {
  const differences: string[] = []
  if (expected.filename !== actual.filename) differences.push('Filename differs.')
  if (expected.sizeBytes !== actual.sizeBytes) differences.push('File size differs.')
  if (Math.abs(expected.durationMs - actual.durationMs) > VIDEO_DURATION_TOLERANCE_MS)
    differences.push('Duration differs by more than 250 ms.')
  if (expected.width !== actual.width || expected.height !== actual.height)
    differences.push('Resolution differs.')
  if (
    expected.mimeType &&
    actual.mimeType &&
    expected.mimeType.split(';')[0].trim().toLowerCase() !==
      actual.mimeType.split(';')[0].trim().toLowerCase()
  )
    differences.push('Video MIME type differs.')
  return differences
}
