import { recordingFile, RECORDING_LIMIT_MS, selectRecordingMime } from './formats'

export type RecordingStatus =
  'idle' | 'requesting-permission' | 'ready' | 'recording' | 'stopping' | 'preview' | 'error'
export interface RecordedVideo {
  file: File
  durationMs: number
}
export interface RecordingSnapshot {
  status: RecordingStatus
  stream: MediaStream | null
  recording: RecordedVideo | null
  previewUrl: string | null
  elapsedMs: number
  error: string | null
  notice: string | null
}
const empty = (): RecordingSnapshot => ({
  status: 'idle',
  stream: null,
  recording: null,
  previewUrl: null,
  elapsedMs: 0,
  error: null,
  notice: null,
})
export function permissionError(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera or microphone permission was denied. Allow both in browser settings, or use Upload Video.'
  if (name === 'NotFoundError')
    return 'A camera or microphone is missing. Connect both devices, or use Upload Video.'
  if (name === 'NotReadableError')
    return 'The camera or microphone is busy or unavailable. Close other apps using them and try again.'
  return 'Could not open the camera and microphone. Check device permissions and try again, or use Upload Video.'
}
export function createRecordingController(limitMs = RECORDING_LIMIT_MS) {
  if (!Number.isFinite(limitMs) || limitMs <= 0)
    throw new Error('Recording limit must be positive.')
  let state = empty(),
    active = false,
    generation = 0
  let stream: MediaStream | null = null,
    recorder: MediaRecorder | null = null
  let chunks: Blob[] = [],
    requestedMime: string | undefined
  let startedAt = 0,
    stoppedAt: number | null = null
  let ticker: ReturnType<typeof setInterval> | undefined,
    limit: ReturnType<typeof setTimeout> | undefined,
    stopTimeout: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  let trackListeners: (() => void)[] = [],
    recorderCleanup: (() => void) | null = null
  const publish = (patch: Partial<RecordingSnapshot>) => {
    state = { ...state, ...patch }
    if (active) listeners.forEach((listener) => listener())
  }
  const clearTimers = () => {
    clearInterval(ticker)
    clearTimeout(limit)
    clearTimeout(stopTimeout)
    ticker = undefined
    limit = undefined
    stopTimeout = undefined
  }
  const releaseStream = () => {
    trackListeners.forEach((remove) => remove())
    trackListeners = []
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
  }
  const releasePreview = () => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl)
  }
  const discard = () => {
    generation++
    clearTimers()
    recorderCleanup?.()
    recorderCleanup = null
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        /* track stop is still required */
      }
    }
    recorder = null
    releaseStream()
    releasePreview()
    chunks = []
  }
  const finish = async (token: number, warning?: string) => {
    if (!active || token !== generation) return
    const mime = recorder?.mimeType || requestedMime || ''
    const durationMs = Math.max(1, (stoppedAt ?? performance.now()) - startedAt)
    const parts = chunks
    chunks = []
    clearTimers()
    recorderCleanup?.()
    recorderCleanup = null
    recorder = null
    releaseStream()
    publish({ status: 'stopping', stream: null })
    try {
      const file = await recordingFile(parts, mime)
      if (!active || token !== generation) return
      publish({
        status: 'preview',
        recording: { file, durationMs },
        previewUrl: URL.createObjectURL(file),
        elapsedMs: durationMs,
        error: null,
        notice: warning || state.notice,
      })
    } catch (error) {
      if (active && token === generation)
        publish({
          status: 'error',
          recording: null,
          error: error instanceof Error ? error.message : 'Could not finalize the recording.',
        })
    }
  }
  const stop = (notice?: string) => {
    if (state.status !== 'recording' || !recorder) return
    stoppedAt = performance.now()
    clearInterval(ticker)
    clearTimeout(limit)
    publish({
      status: 'stopping',
      elapsedMs: stoppedAt - startedAt,
      notice: notice ?? state.notice,
    })
    const token = generation
    stopTimeout = setTimeout(() => {
      void finish(
        token,
        'Recording finalization timed out. Buffered data was preserved, but the video may be incomplete.',
      )
    }, 10_000)
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      void finish(
        token,
        'The recorder stopped unexpectedly. Review/download the recovered recording before continuing.',
      )
    } finally {
      // Releasing capture tracks does not discard native final data/stop events.
      releaseStream()
      publish({ stream: null })
    }
  }
  const interrupted = () => {
    if (state.status === 'recording')
      stop('Camera or microphone disconnected. The available recording was preserved.')
    else if (state.status === 'ready') {
      releaseStream()
      publish({
        status: 'error',
        stream: null,
        error: 'Camera or microphone disconnected. Enable them again to retry.',
      })
    }
  }
  const background = () => {
    if (state.status === 'recording')
      stop(
        'Recording stopped because the page was hidden or interrupted. Review/download it before leaving.',
      )
    else if (state.status === 'ready') {
      releaseStream()
      publish({
        status: 'idle',
        stream: null,
        notice: 'Camera and microphone were released. Enable them again when ready.',
      })
    }
  }
  const visibility = () => {
    if (document.hidden) background()
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    activate(initial?: RecordedVideo | null) {
      if (active) return
      active = true
      state = initial
        ? {
            ...empty(),
            status: 'preview',
            recording: initial,
            previewUrl: URL.createObjectURL(initial.file),
            elapsedMs: initial.durationMs,
          }
        : empty()
      document.addEventListener('visibilitychange', visibility)
      window.addEventListener('pagehide', background)
      listeners.forEach((listener) => listener())
    },
    async prepare() {
      if (!active || !['idle', 'error', 'preview'].includes(state.status)) return
      discard()
      const token = generation
      publish({ ...empty(), status: 'requesting-permission' })
      if (
        !window.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder !== 'function'
      ) {
        publish({
          status: 'error',
          error:
            'Recording requires HTTPS/localhost and a browser supporting camera, microphone and MediaRecorder. You can still use Upload Video.',
        })
        return
      }
      try {
        const result = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: { echoCancellation: true, noiseSuppression: true },
        })
        if (!active || token !== generation) {
          result.getTracks().forEach((track) => track.stop())
          return
        }
        stream = result
        if (!result.getVideoTracks().length || !result.getAudioTracks().length)
          throw new Error('A camera and microphone stream are required.')
        for (const track of result.getTracks()) {
          track.addEventListener('ended', interrupted)
          trackListeners.push(() => track.removeEventListener('ended', interrupted))
        }
        publish({ status: 'ready', stream: result, error: null })
      } catch (error) {
        if (!active || token !== generation) return
        releaseStream()
        publish({ status: 'error', stream: null, error: permissionError(error) })
      }
    },
    start() {
      if (!active || state.status !== 'ready' || !stream) return
      const token = generation
      try {
        requestedMime = selectRecordingMime(MediaRecorder)
        try {
          recorder = new MediaRecorder(
            stream,
            requestedMime ? { mimeType: requestedMime } : undefined,
          )
        } catch {
          recorder = new MediaRecorder(stream)
          requestedMime = undefined
        }
        const current = recorder
        const data = (event: BlobEvent) => {
          if (token === generation && event.data.size) chunks.push(event.data)
        }
        const ended = () => {
          void finish(token)
        }
        const failed = () => {
          if (token !== generation) return
          if (state.status === 'recording')
            stop('The browser reported a recording error. Any available recording was preserved.')
        }
        current.addEventListener('dataavailable', data)
        current.addEventListener('stop', ended)
        current.addEventListener('error', failed)
        recorderCleanup = () => {
          current.removeEventListener('dataavailable', data)
          current.removeEventListener('stop', ended)
          current.removeEventListener('error', failed)
        }
        chunks = []
        startedAt = performance.now()
        stoppedAt = null
        current.start(1000)
        publish({ status: 'recording', error: null, recording: null, elapsedMs: 0, notice: null })
        ticker = setInterval(() => {
          if (state.status === 'recording') publish({ elapsedMs: performance.now() - startedAt })
        }, 250)
        limit = setTimeout(
          () =>
            stop('The recording duration limit was reached. Your recording is ready to review.'),
          limitMs,
        )
      } catch (error) {
        discard()
        publish({
          ...empty(),
          status: 'error',
          error: `Recording could not start. ${error instanceof Error ? error.message : 'Try another browser or upload a video.'}`,
        })
      }
    },
    stop,
    cancel() {
      discard()
      publish(empty())
    },
    dispose() {
      active = false
      discard()
      state = empty()
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', background)
    },
  }
}
