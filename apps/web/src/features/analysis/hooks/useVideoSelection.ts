import { useCallback, useEffect, useRef, useState } from 'react'
import type { VideoMetadata } from '../types'
import {
  readVideoMetadata,
  resolveVideoMetadata,
  validateVideoFile,
  videoDecodeError,
} from '../lib/videoSource'

interface SelectedVideo {
  id: string
  url: string
  file: File
  source: 'upload' | 'live'
  purpose: 'analysis' | 'reconnect'
  metadata: VideoMetadata | null
  error: string | null
}
export function useVideoSelection(onReset: () => void) {
  const [selection, setSelection] = useState<SelectedVideo | null>(null)
  const activeId = useRef<string | null>(null)
  const preserve = useRef(false)
  const probe = useRef<{ id: string; controller: AbortController } | null>(null)
  const abortProbe = useCallback(() => {
    probe.current?.controller.abort()
    probe.current = null
  }, [])
  useEffect(() => () => abortProbe(), [abortProbe])
  const [error, setError] = useState<string | null>(null)
  const url = selection?.url
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  useEffect(() => {
    if (!selection || selection.metadata || selection.error) return
    const id = selection.id
    const timer = setTimeout(
      () =>
        setSelection((old) =>
          old?.id === id
            ? { ...old, error: 'Video metadata did not load. Try another video or format.' }
            : old,
        ),
      20_000,
    )
    return () => clearTimeout(timer)
  }, [selection])
  const select = (
    file: File,
    options: { preserveSession?: boolean; source?: 'upload' | 'live' } = {},
  ) => {
    try {
      validateVideoFile(file)
      const next: SelectedVideo = {
        id: crypto.randomUUID(),
        url: URL.createObjectURL(file),
        file,
        source: options.source ?? 'upload',
        purpose: options.preserveSession ? 'reconnect' : 'analysis',
        metadata: null,
        error: null,
      }
      abortProbe()
      activeId.current = next.id
      preserve.current = !!options.preserveSession
      if (!options.preserveSession) onReset()
      setSelection(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this video.')
    }
  }
  const remove = (options: { preserveSession?: boolean } = {}) => {
    abortProbe()
    activeId.current = null
    if (!options.preserveSession) onReset()
    setSelection(null)
    setError(null)
  }
  const readMetadata = (id: string, video: HTMLVideoElement) => {
    if (activeId.current !== id || probe.current?.id === id) return
    if (video.duration === Infinity) {
      const controller = new AbortController(),
        request = { id, controller }
      probe.current = request
      void resolveVideoMetadata(video, controller.signal)
        .then((metadata) => {
          if (!controller.signal.aborted && activeId.current === id)
            setSelection((old) => (old?.id === id ? { ...old, metadata, error: null } : old))
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted && activeId.current === id)
            setSelection((old) =>
              old?.id === id
                ? {
                    ...old,
                    metadata: null,
                    error:
                      cause instanceof Error ? cause.message : 'Video duration could not be read.',
                  }
                : old,
            )
        })
        .finally(() => {
          if (probe.current === request) probe.current = null
        })
      return
    }
    try {
      const metadata = readVideoMetadata(video)
      setSelection((old) => (old?.id === id ? { ...old, metadata, error: null } : old))
    } catch (cause) {
      setSelection((old) =>
        old?.id === id
          ? {
              ...old,
              metadata: null,
              error: cause instanceof Error ? cause.message : 'Video metadata is unavailable.',
            }
          : old,
      )
    }
  }
  const decodeFailed = (id: string, options: { preserveSession?: boolean } = {}) => {
    // A decode error may also occur during preview after metadata was available.
    if (activeId.current === id) {
      abortProbe()
      if (!preserve.current && !options.preserveSession) onReset()
      setSelection((old) =>
        old?.id === id ? { ...old, metadata: null, error: videoDecodeError } : old,
      )
    }
  }
  return { selection, error, select, remove, readMetadata, decodeFailed }
}
