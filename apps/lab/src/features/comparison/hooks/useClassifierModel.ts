import { useCallback, useEffect, useRef, useState } from 'react'
import { loadClassifier } from '../lib/loadClassifier'
import type { ClassifierFiles, LoadedClassifier } from '../types/comparison'

export function useClassifierModel() {
  const [model, setModel] = useState<LoadedClassifier | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const current = useRef<LoadedClassifier | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const release = useCallback(() => {
    generation.current++
    current.current?.dispose()
    current.current = null
  }, [])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      release()
    }
  }, [release])
  const unload = useCallback(() => {
    release()
    setModel(null)
    setStatus('idle')
    setError(null)
  }, [release])
  const load = async (files: ClassifierFiles) => {
    release()
    const request = generation.current
    setModel(null)
    setStatus('loading')
    setError(null)
    try {
      const loaded = await loadClassifier(files)
      if (!mounted.current || request !== generation.current) {
        loaded.dispose()
        return false
      }
      current.current = loaded
      setModel(loaded)
      setStatus('ready')
      return true
    } catch (cause) {
      if (mounted.current && request === generation.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load classifier files.')
        setStatus('error')
      }
      return false
    }
  }
  return { model, status, error, load, unload }
}
