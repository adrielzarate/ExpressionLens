import { useEffect, useRef, useState } from 'react'
import { prepareAudio } from '../../features/speech/lib/audio'
import { detectCapabilities, realTimeFactor } from '../../features/speech/lib/core'
import type { CapabilityHost } from '../../features/speech/lib/core'
import { VocalClient } from './client'
import { vocalError } from './core'
import type { VocalExpressionSample, WindowSeconds } from './core'
import { vocalModels } from './models'
import type { VocalModelKey } from './models'
import { VocalTimeline } from './Timeline'
import '../stt/stt.css'
import './vocal.css'
interface Metrics {
  decodeMs: number
  preprocessMs: number
  inferenceMs: number
  totalMs: number
  durationMs: number
  windowCheckMs: number
}
interface Run {
  modelKey: VocalModelKey
  labels: string[]
  name: string
  speaker: string
  language: string
  condition: string
  expected: string
  samples: VocalExpressionSample[]
  metrics: Metrics
  seconds: WindowSeconds
  silenceRms: number
}
export function VocalLab() {
  const [modelKey, setModelKey] = useState<VocalModelKey>('wav2vec2')
  const selectedModel = vocalModels[modelKey],
    manifest = selectedModel.manifest
  const [preprocessing, setPreprocessing] = useState('')
  const [capable, setCapable] = useState(false),
    [file, setFile] = useState<File>(),
    [url, setUrl] = useState('')
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('Model not loaded.'),
    [error, setError] = useState('')
  const [labels, setLabels] = useState<string[]>([]),
    [loadMs, setLoadMs] = useState<number>(),
    [normalize, setNormalize] = useState(false)
  const [seconds, setSeconds] = useState<WindowSeconds>(5),
    [silenceRms, setSilenceRms] = useState(0.0001)
  const [speaker, setSpeaker] = useState(''),
    [language, setLanguage] = useState('English'),
    [condition, setCondition] = useState('Conversational speech'),
    [expected, setExpected] = useState('')
  const [result, setResult] = useState<Run>(),
    [history, setHistory] = useState<Run[]>([]),
    [progress, setProgress] = useState<{ done: number; total: number }>()
  const client = useRef<VocalClient | undefined>(undefined),
    generation = useRef(0),
    media = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  useEffect(() => {
    let mounted = true
    void detectCapabilities(window as unknown as CapabilityHost).then((value) => {
      if (mounted) {
        setCapable(value.wasm)
        if (!value.wasm) setError(value.reason)
      }
    })
    return () => {
      mounted = false
      // Invalidate/dispose the latest imperative job, not a React-managed DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      // eslint-disable-next-line react-hooks/exhaustive-deps
      client.current?.terminate()
    }
  }, [])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  function abandon() {
    generation.current++
    client.current?.terminate()
    client.current = undefined
    setReady(false)
    setBusy(false)
    setLoadMs(undefined)
    setError('')
    setStatus(
      'Abandoned. Worker terminated; model reload required. Native decoding/kernel resource cleanup may finish later.',
    )
  }
  async function load() {
    const token = ++generation.current
    setBusy(true)
    setError('')
    setStatus(`Loading self-hosted ${selectedModel.name} on WASM…`)
    setProgress(undefined)
    try {
      client.current?.terminate()
      client.current = new VocalClient((message, done, total) => {
        if (token === generation.current) {
          setStatus(message)
          if (done !== undefined && total !== undefined) setProgress({ done, total })
        }
      })
      const response = await client.current.request({ type: 'load', model: modelKey })
      if (token !== generation.current) return
      if (response.type !== 'ready') throw new Error('Unexpected SER loading response.')
      setLabels(response.labels)
      setNormalize(response.normalize)
      setPreprocessing(response.preprocessing ?? '')
      setLoadMs(response.loadMs)
      setReady(true)
      setStatus('SER model ready.')
    } catch (cause) {
      if (token === generation.current) {
        client.current?.terminate()
        client.current = undefined
        setReady(false)
        setError(vocalError(cause))
        setStatus('SER model loading failed.')
      }
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
      /* Terminate even if idle disposal fails. */
    }
    if (token !== generation.current) return
    client.current?.terminate()
    client.current = undefined
    setReady(false)
    setBusy(false)
    setLoadMs(undefined)
    setStatus('SER model unloaded.')
  }
  async function selectModel(key: VocalModelKey) {
    if (busy || key === modelKey) return
    await unload()
    setModelKey(key)
    setLabels([])
    setProgress(undefined)
    setExpected('')
    setResult(undefined)
    setError('')
    setStatus('Model not loaded. Load the selected model to continue.')
  }
  async function analyze() {
    if (!file || !client.current || !ready) return
    const token = generation.current,
      started = performance.now()
    setBusy(true)
    setError('')
    setResult(undefined)
    setProgress(undefined)
    setStatus('Decoding and preparing local audio…')
    try {
      const prepared = await prepareAudio(file)
      if (token !== generation.current) return
      setStatus('Analyzing sequential windows in the SER Worker…')
      const response = await client.current.request(
        { type: 'analyze', audio: prepared.audio, seconds, silenceRms },
        [prepared.audio.buffer],
      )
      if (token !== generation.current) return
      if (response.type !== 'result') throw new Error('Unexpected SER result.')
      const run: Run = {
        modelKey,
        labels: [...labels],
        name: file.name,
        speaker,
        language,
        condition,
        expected,
        samples: response.samples,
        seconds,
        silenceRms,
        metrics: {
          decodeMs: prepared.decodeMs,
          preprocessMs: prepared.preprocessMs,
          inferenceMs: response.inferenceMs,
          windowCheckMs: response.modelPreprocessMs,
          totalMs: performance.now() - started,
          durationMs: prepared.durationMs,
        },
      }
      setResult(run)
      setHistory((old) => [run, ...old].slice(0, 12))
      setStatus('Analysis finished. Review classified, failed and skipped windows.')
    } catch (cause) {
      if (token === generation.current) {
        setError(vocalError(cause))
        setStatus('SER analysis failed. Abandon and reload after runtime/memory failures.')
      }
    } finally {
      if (token === generation.current) setBusy(false)
    }
  }
  const totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0)
  return (
    <main>
      <a href="/">← ExpressionLens</a>
      <p className="eyebrow">Phase 6A · isolated experiment</p>
      <h1>Vocal Expression Lab</h1>
      <p>
        Explore emotion-related acoustic patterns in how speech sounds. This model does not
        establish a person's actual emotional state. Scores are model softmax outputs, not
        calibrated probabilities about a person.
      </p>
      <section>
        <h2>1. Model and execution</h2>
        <label>
          Vocal expression model
          <select
            value={modelKey}
            disabled={busy}
            onChange={(e) => void selectModel(e.target.value as VocalModelKey)}
          >
            {Object.entries(vocalModels).map(([key, model]) => (
              <option key={key} value={key}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          <code>{manifest.modelId}</code> · {manifest.dtype} · {(totalBytes / 1048576).toFixed(2)}{' '}
          MiB · WASM/CPU · {manifest.license}
        </p>
        <p>{selectedModel.description}</p>
        <p>
          All weights and runtime files are served by this application. Nothing is uploaded. Loading
          is explicit; model files may be cached by the browser.
        </p>
        <div className="controls">
          <button disabled={!capable || busy || ready} onClick={() => void load()}>
            Load SER model
          </button>
          <button disabled={!ready || busy} onClick={() => void unload()}>
            Unload model
          </button>
          <button disabled={!ready && !busy} onClick={abandon}>
            Abandon experiment
          </button>
        </div>
        <p role="status">{status}</p>
        {error && <p role="alert">{error}</p>}
        {progress && (
          <progress aria-label="Analyzed windows" max={progress.total} value={progress.done} />
        )}
        {ready && (
          <p>
            Model categories: {labels.join(', ')} · Input: 16 kHz mono PCM · do_normalize:{' '}
            {String(normalize)}.{' '}
            {preprocessing || "The model's feature extractor applies its own configuration."} No
            Whisper mel features are used.
          </p>
        )}
        <p className="note">
          One Worker/model at a time. Abandoning discards late results; immediate native decode or
          ONNX kernel interruption is not guaranteed. WebGPU is not offered in this WASM reference
          spike.
        </p>
      </section>
      {ready && modelKey === 'wav2vec2' && (
        <p className="note">
          Selected model's category codes: neu = neutral; hap = happy/excited; ang = angry; sad =
          sad. These are acoustic-model categories, not verified emotional states.
        </p>
      )}
      <section>
        <h2>2. Local media and windows</h2>
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
              setError('')
            }}
          />
        </label>
        <p>
          Start with a short clip; maximum five minutes / 250 MiB, subject to browser memory and
          native codec support.
        </p>
        {file &&
          url &&
          (file.type.startsWith('video/') ? (
            <video
              key={url}
              ref={(el) => {
                media.current = el
              }}
              controls
              playsInline
              preload="metadata"
              src={url}
            />
          ) : (
            <audio
              key={url}
              ref={(el) => {
                media.current = el
              }}
              controls
              preload="metadata"
              src={url}
            />
          ))}
        <div className="controls">
          <label>
            Non-overlapping window
            <select
              value={seconds}
              disabled={busy}
              onChange={(e) => setSeconds(Number(e.target.value) as WindowSeconds)}
            >
              {[3, 5, 10].map((value) => (
                <option key={value} value={value}>
                  {value} seconds
                </option>
              ))}
            </select>
          </label>
          <label>
            Silence gate (AC RMS)
            <input
              type="number"
              min={0}
              max={0.1}
              step={0.0001}
              value={silenceRms}
              disabled={busy}
              onChange={(e) => setSilenceRms(e.target.valueAsNumber)}
            />
          </label>
        </div>
        <p className="note">
          The RMS gate is a configurable experimental amplitude heuristic, not voice activity
          detection. Constant/silent audio and tails shorter than 0.5 s are unclassified. Background
          noise above the gate can still be classified. No universal confidence or uncertainty
          threshold is applied.
        </p>
        <button
          disabled={
            !file ||
            !ready ||
            busy ||
            !Number.isFinite(silenceRms) ||
            silenceRms < 0 ||
            silenceRms > 0.1
          }
          onClick={() => void analyze()}
        >
          Analyze vocal expression
        </button>
      </section>
      <section>
        <h2>3. Evaluation notes (optional)</h2>
        <p>
          Annotate before running to compare multiple samples in this tab. Notes/results stay in
          memory; the last 12 runs are retained, without media bytes. These notes are not validated
          ground truth.
        </p>
        <div className="controls">
          <label>
            Speaker code
            <input value={speaker} disabled={busy} onChange={(e) => setSpeaker(e.target.value)} />
          </label>
          <label>
            Spoken language
            <select value={language} disabled={busy} onChange={(e) => setLanguage(e.target.value)}>
              <option>English</option>
              <option>Spanish</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Input condition
            <select
              value={condition}
              disabled={busy}
              onChange={(e) => setCondition(e.target.value)}
            >
              {[
                'Conversational speech',
                'Acted speech',
                'Silence',
                'Background noise',
                'Other',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Expected model category
            <select
              value={expected}
              disabled={busy || !ready}
              onChange={(e) => setExpected(e.target.value)}
            >
              <option value="">Unlabeled / unknown</option>
              {labels.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section>
        <h2>Performance</h2>
        <p>
          Model loading: {loadMs === undefined ? '—' : `${(loadMs / 1000).toFixed(2)} s`} (separate
          from processing).
        </p>
        {result && (
          <>
            <dl>
              {Object.entries({
                Decoding: result.metrics.decodeMs,
                'Mono + native resampling': result.metrics.preprocessMs,
                'Window suitability checks': result.metrics.windowCheckMs,
                'Inference (includes model feature extraction)': result.metrics.inferenceMs,
                'Total processing (excludes model load)': result.metrics.totalMs,
                'Audio duration': result.metrics.durationMs,
              }).map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{(value / 1000).toFixed(3)} s</dd>
                </div>
              ))}
              <div>
                <dt>RTF = inference / audio duration</dt>
                <dd>
                  {realTimeFactor(result.metrics.inferenceMs, result.metrics.durationMs)?.toFixed(
                    3,
                  )}
                </dd>
              </div>
              <div>
                <dt>Total / classified / failed / skipped windows</dt>
                <dd>
                  {result.samples.length} /{' '}
                  {result.samples.filter((s) => s.status === 'classified').length} /{' '}
                  {result.samples.filter((s) => s.status === 'failed').length} /{' '}
                  {
                    result.samples.filter((s) => s.status === 'silent' || s.status === 'too-short')
                      .length
                  }
                </dd>
              </div>
            </dl>
            <p className="note">
              RTF below 1 is faster than real time. Model size excludes runtime, decoded buffers and
              tensors; it is not browser memory usage.
            </p>
          </>
        )}
      </section>
      {result && (
        <VocalTimeline
          samples={result.samples}
          labels={result.labels}
          mediaRef={media}
          mediaKey={url}
        />
      )}
      {history.length > 0 && (
        <section>
          <h2>Run comparisons</h2>
          <button onClick={() => setHistory([])}>Clear run history</button>
          {history.map((run, index) => (
            <article key={index}>
              <h3>
                {run.name} · {vocalModels[run.modelKey].name}
              </h3>
              <p>
                <code>
                  {vocalModels[run.modelKey].manifest.modelId}@
                  {vocalModels[run.modelKey].manifest.revision}
                </code>{' '}
                · {vocalModels[run.modelKey].manifest.dtype}
              </p>
              <p>
                {run.speaker || 'Unspecified speaker'} · {run.language} · {run.condition} · expected{' '}
                {run.expected || 'unlabeled'} · {run.seconds} s windows · RMS {run.silenceRms} · RTF{' '}
                {realTimeFactor(run.metrics.inferenceMs, run.metrics.durationMs)?.toFixed(3)}
              </p>
              <p>
                {run.labels
                  .map(
                    (label) =>
                      `${label}: ${run.samples.filter((s) => s.predictedLabel === label).length}`,
                  )
                  .join(' · ')}{' '}
                · unclassified: {run.samples.filter((s) => !s.predictedLabel).length}
              </p>
              <details>
                <summary>Window scores for this run</summary>
                <div className="vocal-history-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Interval (ms)</th>
                        <th>Prediction / status</th>
                        {run.labels.map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {run.samples.map((sample) => (
                        <tr key={sample.startMs}>
                          <td>
                            {sample.startMs.toFixed(0)}–{sample.endMs.toFixed(0)}
                          </td>
                          <td>{sample.predictedLabel ?? sample.status}</td>
                          {run.labels.map((label) => (
                            <td key={label}>
                              {sample.predictedLabel
                                ? (sample.scores[label] * 100).toFixed(2) + '%'
                                : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
