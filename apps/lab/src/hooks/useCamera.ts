import { useCallback, useEffect, useRef, useState } from 'react'
import type { CameraStatus } from '../types/face'

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
      return 'Camera access was denied. Allow camera access in your browser settings, then try again.'
    case 'NotFoundError':
      return 'No camera was found. Connect a camera and try again.'
    case 'NotReadableError':
      return 'The camera could not be opened. Close other apps using it and try again.'
    case 'OverconstrainedError':
      return 'This camera does not support the requested settings.'
    default:
      return 'The camera could not start. Check your camera and browser permissions, then try again.'
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const release = useCallback(() => {
    generation.current += 1
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }, [])

  const stop = useCallback(() => {
    release()
    setStatus('idle')
    setError(null)
  }, [release])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      release()
    }
  }, [release])

  const start = useCallback(async () => {
    release()
    const request = generation.current
    setError(null)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError(
        !window.isSecureContext
          ? 'Camera access requires HTTPS (or localhost). Open this page using a secure connection.'
          : 'Your browser does not support camera access. Try a current version of Safari, Chrome, Firefox, or Edge.',
      )
      return
    }
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      // Permission prompts can outlive Stop, a new request, or an unmount.
      if (!mounted.current || request !== generation.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          release()
          if (mounted.current) {
            setStatus('error')
            setError('The camera disconnected or access was revoked. Reconnect it and start again.')
          }
        }
      })
      const video = videoRef.current
      if (!video) throw new Error('Video element unavailable')
      video.srcObject = stream
      await video.play()
      if (mounted.current && request === generation.current) setStatus('live')
    } catch (cause) {
      if (!mounted.current || request !== generation.current) return
      release()
      setStatus('error')
      setError(cameraError(cause))
    }
  }, [release])

  const resume = useCallback(async () => {
    const video = videoRef.current
    if (!streamRef.current || !video) return
    const request = generation.current
    try {
      // Called directly from a user click to satisfy mobile playback policy.
      await video.play()
      if (mounted.current && request === generation.current) setError(null)
    } catch {
      if (mounted.current && request === generation.current) {
        setError('Video playback is paused. Keep this page in the foreground and tap Resume video.')
      }
    }
  }, [])

  return { videoRef, status, error, start, stop, resume }
}
