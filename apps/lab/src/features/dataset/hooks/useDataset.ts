import { useCallback, useEffect, useRef, useState } from 'react'
import { datasetStorage, storageError } from '../lib/datasetStorage'
import type { ExpressionLabel, FacialExpressionSample } from '../types/dataset'

export function useDataset() {
  const [samples, setSamples] = useState<FacialExpressionSample[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const locked = useRef(false)
  const refresh = useCallback(async () => {
    try {
      const rows = await datasetStorage.all()
      if (mounted.current) {
        setSamples(rows)
        setError(null)
      }
    } catch (cause) {
      if (mounted.current) setError(storageError(cause))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    // Initial synchronization with external IndexedDB storage.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
    const onFocus = () => {
      if (!locked.current) void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      mounted.current = false
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const mutate = async (operation: () => Promise<void>) => {
    if (locked.current) throw new Error('A dataset operation is already in progress.')
    locked.current = true
    setBusy(true)
    setError(null)
    try {
      await operation()
      const rows = await datasetStorage.all()
      if (mounted.current) setSamples(rows)
    } catch (cause) {
      if (mounted.current) setError(storageError(cause))
      throw cause
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return {
    samples,
    loading,
    busy,
    error,
    refresh,
    add: (rows: readonly FacialExpressionSample[]) => mutate(() => datasetStorage.add(rows)),
    update: (id: string, changes: { label: ExpressionLabel; participantId: string }) =>
      mutate(() => datasetStorage.update(id, changes)),
    remove: (id: string) => mutate(() => datasetStorage.remove(id)),
    clear: () => mutate(() => datasetStorage.clear()),
  }
}
