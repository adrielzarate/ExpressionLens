import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { createFaceLandmarker } from '../lib/mediapipe'
import { videoFrameIdentity } from '../lib/videoFrameIdentity'
import { emptySnapshot } from '../types/face'
import type { ModelStatus, FaceSnapshot, VideoDiagnostics } from '../types/face'

export function useFaceLandmarker(
  videoRef: RefObject<HTMLVideoElement | null>,
  active: boolean,
  targetFps: number,
  numFaces: 1 | 2 = 1,
) {
  const [requested, setRequested] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [model, setModel] = useState<FaceLandmarker | null>(null)
  const [status, setStatus] = useState<ModelStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<FaceSnapshot>(emptySnapshot)

  const [videoDiagnostics, setVideoDiagnostics] = useState<VideoDiagnostics | null>(null)

  useEffect(() => {
    if (!requested) return
    let disposed = false
    let instance: FaceLandmarker | null = null
    createFaceLandmarker({ runningMode: 'VIDEO', numFaces })
      .then((loaded) => {
        if (disposed) {
          loaded.close()
          return
        }
        instance = loaded
        setModel(loaded)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (disposed) return
        console.error('Face Landmarker initialization failed:', cause)
        setError(
          'The local model could not load. Check that model and WASM assets are available, then retry.',
        )
        setStatus('error')
      })
    return () => {
      disposed = true
      instance?.close()
    }
  }, [requested, attempt, numFaces])

  useEffect(() => {
    const video = videoRef.current
    // Reset the external video pipeline when its source or configuration changes.
    // oxlint-disable-next-line react/set-state-in-effect
    setSnapshot(emptySnapshot())
    // oxlint-disable-next-line react/set-state-in-effect
    setVideoDiagnostics(null)
    if (!active || !model || status !== 'ready' || !video) return
    let cancelled = false
    let frameHandle = 0
    let lastFrameId: string | null = null
    let lastInference = -Infinity
    let lastResultAt: number | null = null
    let times: number[] = []
    const durations: number[] = []
    let useVideoFrames = typeof video.requestVideoFrameCallback === 'function'
    let lastCallbackAt = performance.now()
    let callbackCount = 0
    let inferenceCount = 0
    let blockedBy = 'Waiting for a frame callback'

    const clear = () => {
      lastResultAt = null
      times = []
      durations.length = 0
      setSnapshot(emptySnapshot())
    }
    const schedule = () => {
      if (cancelled) return
      frameHandle = useVideoFrames
        ? video.requestVideoFrameCallback(frame)
        : requestAnimationFrame((now) => frame(now))
    }
    function frame(_callbackTime: number, metadata?: VideoFrameCallbackMetadata) {
      if (cancelled) return
      const now = performance.now()
      lastCallbackAt = now
      callbackCount += 1
      const frameId = videoFrameIdentity(video!, metadata)
      const hasPixels = video!.videoWidth > 0 && video!.videoHeight > 0
      // A native frame callback confirms that a frame was presented, even when
      // a stream's readyState has not advanced to HAVE_CURRENT_DATA yet.
      const ready = hasPixels && (metadata !== undefined || video!.readyState >= 2)
      if (document.hidden) blockedBy = 'Page is hidden'
      else if (video!.paused) blockedBy = 'Video playback is paused'
      else if (!ready) blockedBy = `Video not ready (state ${video!.readyState})`
      else if (frameId === lastFrameId) blockedBy = 'Waiting for a different frame'
      else if (now - lastInference < 1000 / targetFps - 1) blockedBy = 'Target FPS limit'
      else {
        lastFrameId = frameId
        lastInference = now
        try {
          const started = performance.now()
          // Synchronous by design: exactly one loop, no overlapping inference.
          const result = model!.detectForVideo(video!, started)
          const duration = performance.now() - started
          lastResultAt = performance.now()
          inferenceCount += 1
          blockedBy = 'Analyzing video'
          times = times.filter((time) => now - time < 1000)
          times.push(now)
          durations.push(duration)
          if (durations.length > 30) durations.shift()
          const faceDetected = result.faceLandmarks.length > 0
          setSnapshot({
            faceDetected,
            faceCount: result.faceLandmarks.length,
            timestampMs: started,
            scheduler: useVideoFrames ? 'video-frame' : 'animation-frame',
            blendshapes: faceDetected
              ? (result.faceBlendshapes[0]?.categories ?? []).map(({ categoryName, score }) => ({
                  name: categoryName,
                  score,
                }))
              : [],
            fps: times.length > 1 ? ((times.length - 1) * 1000) / (now - times[0]) : 0,
            averageDurationMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
          })
        } catch (cause) {
          cancelled = true
          clear()
          console.error('Face inference failed:', cause)
          setError('Facial analysis stopped unexpectedly. Retry the model to resume analysis.')
          setStatus('error')
          return
        }
      }
      schedule()
    }
    // Clear readings immediately when interrupted and after a stalled stream.
    const onVisibility = () => {
      if (document.hidden) clear()
    }
    const onInterrupted = () => clear()
    document.addEventListener('visibilitychange', onVisibility)
    video.addEventListener('pause', onInterrupted)
    video.addEventListener('waiting', onInterrupted)
    video.addEventListener('emptied', onInterrupted)
    const watchdog = window.setInterval(() => {
      const now = performance.now()
      if (lastResultAt !== null && now - lastResultAt > 1500) clear()
      // API availability does not guarantee callbacks keep arriving (for example,
      // when a mobile browser stops compositing the preview after scrolling).
      // Replace the pending callback; never start a second inference loop.
      if (
        !cancelled &&
        useVideoFrames &&
        !document.hidden &&
        !video.paused &&
        video.readyState >= 2 &&
        now - lastCallbackAt > 1500
      ) {
        video.cancelVideoFrameCallback(frameHandle)
        useVideoFrames = false
        // The two APIs use different frame timestamps. Wait for a new frame
        // instead of processing the last native frame again during the handoff.
        lastFrameId = videoFrameIdentity(video)
        blockedBy = 'Switching to fallback scheduler'
        schedule()
      }
      setVideoDiagnostics({
        scheduler: useVideoFrames ? 'video-frame' : 'animation-frame',
        callbacks: callbackCount,
        inferences: inferenceCount,
        width: video.videoWidth,
        height: video.videoHeight,
        readyState: video.readyState,
        paused: video.paused,
        currentTime: video.currentTime,
        blockedBy: document.hidden
          ? 'Page is hidden'
          : video.paused
            ? 'Video playback is paused'
            : now - lastCallbackAt > 1500
              ? 'Waiting for a frame callback'
              : blockedBy,
      })
    }, 500)
    schedule()
    return () => {
      cancelled = true
      if (useVideoFrames) video.cancelVideoFrameCallback(frameHandle)
      else cancelAnimationFrame(frameHandle)
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', onVisibility)
      video.removeEventListener('pause', onInterrupted)
      video.removeEventListener('waiting', onInterrupted)
      video.removeEventListener('emptied', onInterrupted)
    }
  }, [active, model, status, targetFps, videoRef])

  return {
    status,
    error,
    videoDiagnostics: active && status === 'ready' ? videoDiagnostics : null,
    snapshot: active && status === 'ready' ? snapshot : emptySnapshot(),
    load: () => {
      if (!requested) {
        setStatus('loading')
        setRequested(true)
      }
    },
    retry: () => {
      setModel(null)
      setError(null)
      setStatus('loading')
      setAttempt((value) => value + 1)
    },
  }
}
