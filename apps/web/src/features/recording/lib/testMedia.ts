import { vi } from 'vitest'

export class FakeTrack extends EventTarget {
  readyState = 'live'
  stop = vi.fn(() => {
    this.readyState = 'ended'
  })
  end() {
    this.readyState = 'ended'
    this.dispatchEvent(new Event('ended'))
  }
}
export function fakeStream() {
  const video = new FakeTrack(),
    audio = new FakeTrack()
  return {
    video,
    audio,
    stream: {
      getTracks: () => [video, audio],
      getVideoTracks: () => [video],
      getAudioTracks: () => [audio],
    } as unknown as MediaStream,
  }
}
export class FakeRecorder extends EventTarget {
  static instances: FakeRecorder[] = []
  static supported = new Set(['video/mp4'])
  static isTypeSupported(type: string) {
    return FakeRecorder.supported.has(type)
  }
  static failPreferred = false
  state: RecordingState = 'inactive'
  mimeType: string
  stream: MediaStream
  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    super()
    this.stream = stream
    if (FakeRecorder.failPreferred && options?.mimeType) throw new Error('Encoder unavailable')
    this.mimeType = options?.mimeType || 'video/mp4'
    FakeRecorder.instances.push(this)
  }
  start = vi.fn(() => {
    this.state = 'recording'
  })
  stop = vi.fn(() => {
    this.state = 'inactive'
  })
  emitData(data = new Blob(['video'], { type: this.mimeType })) {
    const event = new Event('dataavailable')
    Object.defineProperty(event, 'data', { value: data })
    this.dispatchEvent(event)
  }
  finish(data?: Blob) {
    this.state = 'inactive'
    this.emitData(data)
    this.dispatchEvent(new Event('stop'))
  }
}
export function installMedia() {
  const tracks = fakeStream()
  const getUserMedia = vi.fn(async () => tracks.stream)
  FakeRecorder.instances = []
  FakeRecorder.supported = new Set(['video/mp4'])
  FakeRecorder.failPreferred = false
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const create = vi.fn(() => 'blob:recording'),
    revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
  return { ...tracks, getUserMedia, create, revoke }
}
