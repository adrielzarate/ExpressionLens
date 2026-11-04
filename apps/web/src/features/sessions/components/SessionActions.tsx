import { useEffect, useRef, useState } from 'react'
import type { AnalysisSession } from '../../analysis/types'
import { downloadSession, MAX_SESSION_BYTES, parseSessionJSON } from '../lib/serialization'

export function SessionActions({
  session,
  disabled,
  onRestore,
  onBusyChange,
}: {
  session: AnalysisSession | null
  disabled: boolean
  onRestore: (session: AnalysisSession) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<AnalysisSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const request = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const settle = () => {
    setBusy(false)
    onBusyChange(false)
  }
  const restore = (value: AnalysisSession) => {
    onRestore(value)
    setPending(null)
    setError(null)
    settle()
  }
  const importFile = async (file: File) => {
    const token = ++request.current
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      if (file.size > MAX_SESSION_BYTES) throw new Error('Session file exceeds 50 MiB.')
      const json = await file.text()
      if (!mounted.current || request.current !== token) return
      const value = parseSessionJSON(json)
      if (session) {
        setPending(value)
        setBusy(false)
      } else restore(value)
    } catch (cause) {
      if (mounted.current && request.current === token) {
        setError(cause instanceof Error ? cause.message : 'Could not import the session.')
        settle()
      }
    }
  }
  return (
    <section className="session-actions" aria-labelledby="session-actions-title">
      <h2 id="session-actions-title">Save or open an analysis</h2>
      <div className="analysis-actions">
        <label className="session-file-action">
          Import Session
          <input
            type="file"
            accept="application/json,.json"
            disabled={disabled || busy || !!pending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void importFile(file)
            }}
          />
        </label>
        {session && (
          <button
            className="product-button secondary"
            disabled={disabled || busy}
            onClick={() => {
              try {
                downloadSession(session)
                setError(null)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Could not export the session.')
              }
            }}
          >
            Export Session
          </button>
        )}
      </div>
      {busy && <p role="status">Reading and validating the local session…</p>}
      {error && (
        <p className="analysis-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <section className="session-confirmation" aria-label="Confirm session replacement">
          <h3>Replace the current session?</h3>
          <p>
            The new file was validated. Export your current results first if you want to keep them.
            Its video connection will be cleared.
          </p>
          <div className="analysis-actions">
            <button className="product-button" onClick={() => restore(pending)}>
              Replace session
            </button>
            <button
              className="product-button secondary"
              onClick={() => {
                setPending(null)
                settle()
              }}
            >
              Keep current session
            </button>
          </div>
        </section>
      )}
      <p className="analysis-small">
        JSON contains facial/vocal results, transcript text and video metadata, never the video or
        audio itself. These results may be sensitive. You control where exported files are stored
        and shared; nothing is uploaded or saved automatically.
      </p>
    </section>
  )
}
