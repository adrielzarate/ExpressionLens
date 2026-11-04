import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AnalysisOptions,
  AnalysisProgress,
  AnalysisSession,
  AnalysisStatus,
  SessionVideoMetadata,
} from '../types'
import { analyzeVideo } from '../lib/analyzeVideo'
import { runSessionAnalyses } from '../lib/runSessionAnalyses'
import { isAbortError } from '../lib/abort'

interface AnalysisState {
  status: AnalysisStatus
  progress: AnalysisProgress | null
  session: AnalysisSession | null
  error: string | null
}
const empty = (): AnalysisState => ({ status: 'idle', progress: null, session: null, error: null })

export function useVideoAnalysis() {
  const [state, setState] = useState<AnalysisState>(empty)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const current = useRef<{ controller: AbortController; generation: number } | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const abortCurrent = useCallback(() => {
    generation.current++
    current.current?.controller.abort()
  }, [])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abortCurrent()
    }
  }, [abortCurrent])
  const reset = useCallback(() => {
    abortCurrent()
    setState(empty())
  }, [abortCurrent])
  const cancel = useCallback(() => {
    current.current?.controller.abort()
    setState((old) => ({ ...old, status: 'cancelled', error: null }))
  }, [])
  const start = useCallback(
    async (
      url: string,
      video?: SessionVideoMetadata,
      source: AnalysisSession['source'] = 'upload',
      options?: AnalysisOptions,
    ) => {
      if (current.current || !mounted.current) return
      const job = { controller: new AbortController(), generation: ++generation.current }
      current.current = job
      const valid = () => mounted.current && generation.current === job.generation
      setBusy(true)
      setState({ ...empty(), status: 'loading', session: options ? state.session : null })
      setStage('Preparing analysis…')
      try {
        if (options) {
          if (!video) throw new Error('Readable video metadata is required.')
          const session = await runSessionAnalyses(
            url,
            video,
            source,
            options,
            state.session,
            job.controller.signal,
            (session) => {
              if (valid()) setState((old) => ({ ...old, session }))
            },
            (progress) => {
              if (valid()) setState((old) => ({ ...old, status: 'analyzing', progress }))
            },
            (stage) => {
              if (valid()) setStage(stage)
            },
          )
          if (valid()) setState((old) => ({ ...old, status: 'completed', session }))
          return
        }
        const session = await analyzeVideo(url, job.controller.signal, (progress) => {
          if (valid() && !job.controller.signal.aborted)
            setState({ status: 'analyzing', progress, session: null, error: null })
        })
        if (valid() && !job.controller.signal.aborted)
          setState((old) => ({
            ...old,
            status: 'completed',
            session: {
              ...session,
              source,
              ...(video ? { video: { ...video, durationMs: session.durationMs } } : {}),
            },
          }))
      } catch (error) {
        if (valid())
          setState((old) => ({
            ...old,
            status: isAbortError(error) ? 'cancelled' : 'error',
            session: options ? old.session : null,
            error: isAbortError(error)
              ? null
              : error instanceof Error
                ? error.message
                : 'Could not analyze the video.',
          }))
      } finally {
        if (current.current === job) {
          current.current = null
          if (mounted.current) setBusy(false)
        }
      }
    },
    [state.session],
  )
  const restore = useCallback(
    (session: AnalysisSession) => {
      abortCurrent()
      setState({ status: 'completed', progress: null, session, error: null })
    },
    [abortCurrent],
  )
  return { ...state, stage, busy, start, cancel, reset, restore }
}
