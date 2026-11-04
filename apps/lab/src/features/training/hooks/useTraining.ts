import { useEffect, useRef, useState } from 'react'
import type {
  EpochMetrics,
  PreparedDataset,
  TrainingConfig,
  TrainingResponse,
  TrainingResult,
} from '../types/training'

export function useTraining() {
  const worker = useRef<Worker | null>(null)
  const [status, setStatus] = useState<
    'idle' | 'training' | 'evaluating' | 'complete' | 'error' | 'cancelled'
  >('idle')
  const [history, setHistory] = useState<EpochMetrics[]>([])
  const [result, setResult] = useState<TrainingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () => () => {
      worker.current?.terminate()
      worker.current = null
    },
    [],
  )
  const reset = () => {
    worker.current?.terminate()
    worker.current = null
    setStatus('idle')
    setHistory([])
    setResult(null)
    setError(null)
  }
  const start = (data: PreparedDataset, config: TrainingConfig) => {
    if (worker.current) return
    setHistory([])
    setResult(null)
    setError(null)
    setStatus('training')
    try {
      const instance = new Worker(new URL('../lib/training.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.current = instance
      const finish = () => {
        instance.terminate()
        if (worker.current === instance) worker.current = null
      }
      instance.onmessage = (event: MessageEvent<TrainingResponse>) => {
        if (worker.current !== instance) return
        const message = event.data
        if (message.type === 'epoch') setHistory((rows) => [...rows, message.metrics])
        else if (message.type === 'evaluating') setStatus('evaluating')
        else if (message.type === 'complete') {
          setResult(message.result)
          setHistory(message.result.history)
          setStatus('complete')
          finish()
        } else {
          setError(message.message)
          setStatus('error')
          finish()
        }
      }
      instance.onerror = (event) => {
        if (worker.current !== instance) return
        setError(
          event.message ||
            'The training worker could not start. Check browser support and available memory.',
        )
        setStatus('error')
        finish()
      }
      instance.onmessageerror = () => {
        if (worker.current !== instance) return
        setError('Could not receive training results. Try again with a smaller dataset.')
        setStatus('error')
        finish()
      }
      instance.postMessage({ type: 'train', data, config })
    } catch (cause) {
      worker.current?.terminate()
      worker.current = null
      setError(cause instanceof Error ? cause.message : 'Could not start training.')
      setStatus('error')
    }
  }
  return {
    status,
    history,
    result,
    error,
    start,
    reset,
    cancel: () => {
      worker.current?.terminate()
      worker.current = null
      setStatus('cancelled')
      setResult(null)
    },
  }
}
