import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraPreview } from '../../../components/CameraPreview'
import { useCamera } from '../../../hooks/useCamera'
import { useFaceLandmarker } from '../../../hooks/useFaceLandmarker'
import { IdentityFields } from './IdentityFields'
import { FeatureVector } from './FeatureVector'
import { validateParticipantId } from '../lib/datasetValidation'
import { storageError } from '../lib/datasetStorage'
import { sampleFromSnapshot } from '../lib/webcamCapture'
import type { CapturePlan } from '../lib/webcamCapture'
import type { FacialExpressionSample, SampleIdentity } from '../types/dataset'

export function WebcamCollector({
  disabled,
  onActivity,
  onSave,
}: {
  disabled: boolean
  onActivity: (active: boolean) => void
  onSave: (samples: readonly FacialExpressionSample[]) => Promise<void>
}) {
  const camera = useCamera()
  const stopCamera = camera.stop
  const analysis = useFaceLandmarker(camera.videoRef, camera.status === 'live', 5, 2)
  const [identity, setIdentity] = useState<SampleIdentity>({
    participantId: '',
    label: 'neutral',
    source: 'real',
  })
  const [duration, setDuration] = useState(5)
  const [phase, setPhase] = useState<'idle' | 'countdown' | 'capturing' | 'review'>('idle')
  const [remaining, setRemaining] = useState(0)
  const [pending, setPending] = useState<FacialExpressionSample[]>([])
  const [inspected, setInspected] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const plan = useRef<CapturePlan | null>(null)
  const phaseRef = useRef(phase)
  const active = phase === 'countdown' || phase === 'capturing'
  const saveLock = useRef(false)
  const mounted = useRef(false)
  const finish = useCallback((message?: string) => {
    plan.current = null
    phaseRef.current = 'review'
    setPhase('review')
    setRemaining(0)
    if (message) setError(message)
  }, [])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      plan.current = null
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const tick = () => {
      const window = plan.current
      if (!window) return
      const now = performance.now()
      if (now >= window.endsAt) {
        finish()
        stopCamera()
        return
      }
      if (now >= window.startsAt) {
        phaseRef.current = 'capturing'
        setPhase('capturing')
        setRemaining(Math.max(0, Math.ceil((window.endsAt - now) / 1000)))
      } else setRemaining(Math.ceil((window.startsAt - now) / 1000))
    }
    const timer = window.setInterval(tick, 100)
    const onHidden = () => {
      if (document.hidden) {
        // Synchronize capture state with the external camera/inference pipeline.
        // oxlint-disable-next-line react/set-state-in-effect
        finish(
          'Capture interrupted when the page left the foreground. Review the partial capture or discard it.',
        )
        stopCamera()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [active, finish, stopCamera])

  useEffect(() => {
    const window = plan.current
    if (!window) return
    if (camera.status !== 'live' || analysis.status !== 'ready') {
      // Synchronize capture state with an interrupted external camera pipeline.
      // oxlint-disable-next-line react/set-state-in-effect
      finish('Capture interrupted. Review the partial capture or discard it.')
      return
    }
    try {
      const sample = sampleFromSnapshot(analysis.snapshot, window)
      // oxlint-disable-next-line react/set-state-in-effect
      if (sample) setPending((rows) => [...rows, sample])
    } catch (cause) {
      setError(`Frame skipped: ${storageError(cause)}`)
    }
  }, [analysis.snapshot, analysis.status, camera.status, finish])

  const begin = () => {
    try {
      const participantId = validateParticipantId(identity.participantId.trim())
      const startsAt = performance.now() + 3000
      plan.current = {
        identity: { ...identity, participantId },
        sessionId: crypto.randomUUID(),
        startsAt,
        endsAt: startsAt + duration * 1000,
        lastSampleAt: null,
      }
      setPending([])
      setInspected(0)
      setError(null)
      setRemaining(3)
      phaseRef.current = 'countdown'
      setPhase('countdown')
      onActivity(true)
    } catch (cause) {
      setError(storageError(cause))
    }
  }
  const discard = () => {
    plan.current = null
    phaseRef.current = 'idle'
    setPhase('idle')
    setPending([])
    setError(null)
    stopCamera()
    onActivity(false)
  }
  const save = async () => {
    if (!pending.length || saveLock.current) return
    saveLock.current = true
    setSaving(true)
    setError(null)
    try {
      await onSave(pending)
      if (mounted.current) discard()
    } catch (cause) {
      if (mounted.current) setError(storageError(cause))
    } finally {
      saveLock.current = false
      if (mounted.current) setSaving(false)
    }
  }
  return (
    <section className="dataset-webcam" aria-labelledby="webcam-title">
      <div className="panel dataset-card">
        <div className="panel-heading">
          <h2 id="webcam-title">Webcam capture</h2>
          <span className="badge">REAL · ~5 FPS</span>
        </div>
        <div className="dataset-card-body">
          <p>
            Choose an observable expression. A 3-second countdown gives you time to prepare. Only
            frames with exactly one detected face are collected.
          </p>
          <fieldset disabled={disabled || phase !== 'idle'}>
            <legend className="sr-only">Webcam capture identity</legend>
            <IdentityFields value={identity} onChange={setIdentity} realOnly />
            <label className="duration-field">
              Capture duration
              <select
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                {[3, 5, 10].map((seconds) => (
                  <option value={seconds} key={seconds}>
                    {seconds} seconds
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <div className="capture-state" role="status">
            {phase === 'countdown'
              ? `Get ready: ${remaining}…`
              : phase === 'capturing'
                ? `${identity.label} · ${remaining}s remaining · ${pending.length} samples`
                : phase === 'review'
                  ? `${pending.length} samples ready for review. Not saved yet.`
                  : `${camera.status === 'live' ? `Camera live · Model ${analysis.status} · ${analysis.snapshot.faceCount} faces` : 'Start the camera, then begin the countdown.'}`}
          </div>
          {phase === 'idle' && (
            <button
              className="button primary"
              disabled={disabled || camera.status !== 'live' || analysis.status !== 'ready'}
              onClick={begin}
            >
              Start countdown
            </button>
          )}
          {active && (
            <button
              className="button secondary"
              onClick={() => {
                finish('Capture ended early. Review the partial capture.')
                stopCamera()
              }}
            >
              End capture
            </button>
          )}
          {phase === 'review' && (
            <>
              <div className="button-group">
                <button
                  className="button primary"
                  disabled={!pending.length || saving}
                  onClick={() => {
                    void save()
                  }}
                >
                  {saving ? 'Saving…' : `Save ${pending.length} samples`}
                </button>
                <button className="button secondary" disabled={saving} onClick={discard}>
                  Discard capture
                </button>
              </div>
              {pending.length > 0 && (
                <details>
                  <summary>Inspect captured feature vectors</summary>
                  <label>
                    Sample
                    <select
                      value={inspected}
                      onChange={(event) => setInspected(Number(event.target.value))}
                    >
                      {pending.map((row, i) => (
                        <option key={row.id} value={i}>
                          Sample {i + 1} · {row.label} · {row.participantId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <FeatureVector features={pending[inspected]?.features ?? pending[0].features} />
                </details>
              )}
            </>
          )}
          {(error || camera.error || analysis.error) && (
            <div className="dataset-error" role="alert">
              {error && <p>{error}</p>}
              {camera.error && <p>{camera.error}</p>}
              {analysis.error && (
                <p>
                  {analysis.error}{' '}
                  <button className="text-button" onClick={analysis.retry}>
                    Retry model
                  </button>
                </p>
              )}
            </div>
          )}
          {camera.status === 'live' &&
            analysis.status === 'ready' &&
            analysis.snapshot.faceCount !== 1 && (
              <p className="collection-hint">
                {analysis.snapshot.faceCount > 1
                  ? 'Multiple faces detected. Keep only one person in frame.'
                  : 'Waiting for exactly one face. Unobserved or invalid frames are skipped.'}
              </p>
            )}
        </div>
      </div>
      <CameraPreview
        startDisabled={disabled || phase !== 'idle'}
        videoRef={camera.videoRef}
        status={camera.status}
        faceDetected={analysis.snapshot.faceDetected}
        onStart={() => {
          if (disabled || phaseRef.current !== 'idle') return
          analysis.load()
          void camera.start()
        }}
        onStop={() => {
          if (plan.current) finish('Camera stopped. Review the partial capture.')
          stopCamera()
        }}
        paused={analysis.videoDiagnostics?.paused ?? false}
        onResume={() => {
          void camera.resume()
        }}
      />
    </section>
  )
}
