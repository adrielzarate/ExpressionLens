import { useEffect, useRef, useState } from 'react'
import { prepareAudio } from './audio'
import { SpeechClient } from './client'
import {
  MODEL_ID,
  describeError,
  detectCapabilities,
  normalizeTranscript,
  realTimeFactor,
} from './core'
import type { Backend, CapabilityHost, Language, Measurements, TranscriptionResult } from './core'
import './stt.css'

function time(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(Math.round(ms % 1000)).padStart(3, '0')}`
}
export function SpeechExperiment() {
  const [capabilities, setCapabilities] = useState<{
    wasm: boolean
    webgpu: boolean
    reason: string
  }>()
  const [backend, setBackend] = useState<Backend>('wasm')
  const [language, setLanguage] = useState<Language>('english')
  const [file, setFile] = useState<File>()
  const [url, setUrl] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Model not loaded.')
  const [error, setError] = useState('')
  const [loadMs, setLoadMs] = useState<number>()
  const [result, setResult] = useState<TranscriptionResult>()
  const [metrics, setMetrics] = useState<Measurements>()
  const [positionMs, setPositionMs] = useState(0)
  const client = useRef<SpeechClient | undefined>(undefined)
  const generation = useRef(0)
  const media = useRef<HTMLMediaElement | null>(null)
  useEffect(() => {
    let mounted = true
    void detectCapabilities(window as unknown as CapabilityHost).then((value) => {
      if (mounted) setCapabilities(value)
    })
    return () => {
      mounted = false
      // Invalidate asynchronous work using the latest generation at unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      // Dispose the latest owned service; this is not a React-managed DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      client.current?.terminate()
      client.current = undefined
    }
  }, [])
  useEffect(() => {
    if (!url) return
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [url])
  // The media clock, rather than an inference clock, drives highlighting.
  useEffect(() => {
    if (!url) return
    let frame = 0
    const tick = () => {
      setPositionMs((media.current?.currentTime ?? 0) * 1000)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [url])
  function abandon() {
    generation.current++
    client.current?.terminate()
    client.current = undefined
    setBusy(false)
    setReady(false)
    setLoadMs(undefined)
    setStatus(
      'Experiment abandoned. Worker terminated; model reload required. Browser/GPU resource reclamation may finish later.',
    )
    setError('')
  }
  async function load() {
    const token = ++generation.current
    setBusy(true)
    setReady(false)
    setError('')
    setResult(undefined)
    setMetrics(undefined)
    setLoadMs(undefined)
    try {
      client.current?.terminate()
      client.current = new SpeechClient((message) => {
        if (token === generation.current) setStatus(message)
      })
      setStatus(`Loading ${MODEL_ID} (q8) on ${backend}…`)
      const response = await client.current.request({ type: 'load', backend })
      if (token !== generation.current) return
      if (response.type !== 'ready') throw new Error('Unexpected loading response.')
      setReady(true)
      setLoadMs(response.loadMs)
      setStatus('Model ready.')
    } catch (failure) {
      if (token !== generation.current) return
      client.current?.terminate()
      client.current = undefined
      setError(describeError(failure))
      setStatus('Model load failed.')
    } finally {
      if (token === generation.current) setBusy(false)
    }
  }
  async function unload() {
    const token = ++generation.current
    setBusy(true)
    try {
      await client.current?.request({ type: 'dispose' })
    } catch {
      /* Terminate below even if disposal fails. */
    }
    if (token !== generation.current) return
    client.current?.terminate()
    client.current = undefined
    setReady(false)
    setBusy(false)
    setLoadMs(undefined)
    setStatus('Model unloaded.')
  }
  async function transcribe() {
    if (!file || !ready || !client.current) return
    // Keep this generation for loading progress; requests are strictly serial.
    const token = generation.current
    const started = performance.now()
    setBusy(true)
    setError('')
    setResult(undefined)
    setMetrics(undefined)
    setStatus('Decoding and preparing local audio…')
    try {
      const prepared = await prepareAudio(file)
      if (token !== generation.current) return
      setStatus('Transcribing in Worker (30 s windows, 5 s stride). This may take several minutes…')
      const response = await client.current.request(
        { type: 'transcribe', audio: prepared.audio, language },
        [prepared.audio.buffer],
      )
      if (token !== generation.current) return
      if (response.type !== 'result') throw new Error('Unexpected transcription response.')
      const normalized = normalizeTranscript(response.output, prepared.durationMs)
      setResult({
        ...normalized,
        language: language === 'auto' ? null : language,
        modelId: MODEL_ID,
        backend,
      })
      setMetrics({
        decodeMs: prepared.decodeMs,
        preprocessMs: prepared.preprocessMs,
        durationMs: prepared.durationMs,
        inputBytes: prepared.inputBytes,
        inferenceMs: response.inferenceMs,
        totalMs: performance.now() - started,
      })
      setStatus('Transcription complete.')
    } catch (failure) {
      if (token !== generation.current) return
      setError(describeError(failure))
      setStatus('Transcription failed. Abandon and reload if the backend is no longer usable.')
    } finally {
      if (token === generation.current) setBusy(false)
    }
  }
  return (
    <main>
      <a href="/">← ExpressionLens</a>
      <p className="eyebrow">Phase 5A · isolated technical spike</p>
      <h1>Browser speech-to-text</h1>
      <p>
        Experimental transcription in the spoken language. Audio stays on this device. Model
        initialization loads model files from this application’s own server and may cache them in
        your browser; audio and transcripts are never uploaded or persistently stored.
      </p>
      <section aria-label="Configuration">
        <h2>1. Prepare the experiment</h2>
        <p>
          <code>{MODEL_ID}</code> · Transformers.js 4.3.2 · q8 encoder + decoder · one Worker / one
          model
        </p>
        <p>
          {capabilities?.reason ?? 'Checking capabilities…'} WebGPU:{' '}
          {capabilities
            ? capabilities.webgpu
              ? 'adapter available (model support must still be tested)'
              : 'unavailable; use WASM'
            : 'checking'}
          .
        </p>
        <div className="controls">
          <label>
            Execution backend
            <select
              value={backend}
              disabled={busy || ready}
              onChange={(e) => setBackend(e.target.value as Backend)}
            >
              <option value="wasm" disabled={!capabilities?.wasm}>
                WASM / CPU
              </option>
              <option value="webgpu" disabled={!capabilities?.webgpu}>
                WebGPU (experimental)
              </option>
            </select>
          </label>
          <label>
            Spoken language
            <select
              value={language}
              disabled={busy}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
              <option value="auto">Auto (experimental)</option>
            </select>
          </label>
          <button disabled={!capabilities?.wasm || busy || ready} onClick={() => void load()}>
            Load model
          </button>
          <button disabled={!ready || busy} onClick={() => void unload()}>
            Unload model
          </button>
        </div>
        <p>
          Auto delegates detection to Whisper; the detected language is not exposed reliably by this
          pipeline. Select English or Spanish for controlled comparisons. Backend changes require
          unloading first; fallback never silently downloads another variant.
        </p>
        <p role="status">{status}</p>
        {error && <p role="alert">{error}</p>}
        <button disabled={!busy && !ready} onClick={abandon}>
          Abandon experiment
        </button>
        <p className="note">
          Abandoning terminates the Worker and ignores late results. An active native decode or
          ONNX/GPU kernel may finish before the browser reclaims resources; immediate hardware
          interruption is not guaranteed.
        </p>
      </section>
      <section>
        <h2>2. Local media</h2>
        <label>
          Audio or video file
          <input
            type="file"
            accept="audio/*,video/*"
            disabled={busy}
            onChange={(e) => {
              const next = e.target.files?.[0]
              setFile(next)
              setUrl(next ? URL.createObjectURL(next) : '')
              setResult(undefined)
              setMetrics(undefined)
              setError('')
              setPositionMs(0)
            }}
          />
        </label>
        <p>
          Start with 15–60 seconds; use 2–3 minutes to test chunking. Spike limits: five minutes
          decoded audio and 250 MiB file size. Native codec support varies by browser.
        </p>
        {file &&
          url &&
          (file.type.startsWith('video/') ? (
            <video
              key={url}
              ref={(element) => {
                media.current = element
              }}
              src={url}
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <audio
              key={url}
              ref={(element) => {
                media.current = element
              }}
              src={url}
              controls
              preload="metadata"
            />
          ))}
        <button disabled={!file || !ready || busy} onClick={() => void transcribe()}>
          Transcribe locally
        </button>
      </section>
      <section aria-label="Performance measurements">
        <h2>Measurements</h2>
        <p>
          Model loading (separate): {loadMs === undefined ? '—' : `${(loadMs / 1000).toFixed(2)} s`}
        </p>
        {metrics && result && (
          <>
            <dl>
              {Object.entries({
                'Audio decoding': metrics.decodeMs,
                'Mono + resampling': metrics.preprocessMs,
                Inference: metrics.inferenceMs,
                'Total processing (excludes model load)': metrics.totalMs,
                'Audio duration': metrics.durationMs,
              }).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{(value / 1000).toFixed(2)} s</dd>
                </div>
              ))}
              <div>
                <dt>RTF (inference / audio duration)</dt>
                <dd>{realTimeFactor(metrics.inferenceMs, metrics.durationMs)?.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Backend / model</dt>
                <dd>
                  {result.backend} / {result.modelId} (q8)
                </dd>
              </div>
              <div>
                <dt>Segments</dt>
                <dd>{result.segments.length}</dd>
              </div>
              <div>
                <dt>16 kHz mono PCM input estimate</dt>
                <dd>{(metrics.inputBytes / 1048576).toFixed(2)} MiB</dd>
              </div>
            </dl>
            <p className="note">
              RTF &lt; 1 is faster than real time; &gt; 1 is slower. PCM size excludes decoded
              source buffers, model weights, tensors and runtime allocations; it is not browser
              memory usage.
            </p>
          </>
        )}
      </section>
      {result && (
        <section>
          <h2>3. Transcript</h2>
          <p>
            Requested language: {result.language ?? 'Auto (detected language unreported)'}. Task:
            transcribe.
          </p>
          <p className="transcript">{result.text || '(No speech text returned.)'}</p>
          {result.timestampWarning && <p role="alert">{result.timestampWarning}</p>}
          <p className="note">
            Model-generated segment timing is approximate. Click a segment to seek; highlight
            follows the media clock.
          </p>
          <ol className="segments">
            {result.segments.map((segment, i) => (
              <li key={`${i}-${segment.startMs}`}>
                <button
                  className={
                    positionMs >= segment.startMs && positionMs < segment.endMs ? 'active' : ''
                  }
                  aria-current={
                    positionMs >= segment.startMs && positionMs < segment.endMs ? 'true' : undefined
                  }
                  onClick={() => {
                    if (media.current) {
                      media.current.currentTime = segment.startMs / 1000
                      setPositionMs(segment.startMs)
                    }
                  }}
                >
                  <small>
                    {time(segment.startMs)} – {time(segment.endMs)}
                  </small>
                  {segment.text}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  )
}
