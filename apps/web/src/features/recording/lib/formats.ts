export const RECORDING_LIMIT_MS = 10 * 60 * 1000
const preferredTypes = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm',
  'video/mp4',
]
export function selectRecordingMime(
  recorder: Pick<typeof MediaRecorder, 'isTypeSupported'>,
): string | undefined {
  return typeof recorder.isTypeSupported === 'function'
    ? preferredTypes.find((type) => recorder.isTypeSupported(type))
    : undefined
}
export function recordingExtension(type: string) {
  switch (type.split(';')[0].trim().toLowerCase()) {
    case 'video/mp4':
      return 'mp4'
    case 'video/webm':
      return 'webm'
    case 'video/ogg':
      return 'ogv'
    case 'video/x-matroska':
      return 'mkv'
    default:
      return 'bin'
  }
}
async function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}
export async function recordingFile(chunks: Blob[], mime: string): Promise<File> {
  const data = new Blob(chunks)
  if (!data.size)
    throw new Error('The recording is empty. Check your camera/microphone and try again.')
  let actual = chunks.find((chunk) => chunk.type.startsWith('video/'))?.type || mime
  if (!actual) {
    const bytes = new Uint8Array(await blobBytes(data.slice(0, 256)))
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      const header = String.fromCharCode(...bytes)
      if (header.includes('webm')) actual = 'video/webm'
      else if (header.includes('matroska')) actual = 'video/x-matroska'
    } else if (String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') actual = 'video/mp4'
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return new File([data], `interview-mirror-recording-${stamp}.${recordingExtension(actual)}`, {
    type: actual || 'application/octet-stream',
  })
}
export function downloadRecording(file: File) {
  const url = URL.createObjectURL(file),
    link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
