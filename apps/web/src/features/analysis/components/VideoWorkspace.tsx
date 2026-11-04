import { hasAnalysisIssues } from '../lib/sessionStatus'
import { TranscriptTimeline } from '../../speech/components/TranscriptTimeline'
import type { Language } from '../../speech/types'
import { RecordingPanel } from '../../recording/components/RecordingPanel'
import type { RecordedVideo } from '../../recording/lib/recorder'
import { downloadRecording } from '../../recording/lib/formats'
import { useEffect, useRef, useState } from 'react'
import { ExpressionTimeline } from '../../timeline/components/ExpressionTimeline'
import { SessionActions } from '../../sessions/components/SessionActions'
import { describeVideo, videoDifferences } from '../../sessions/lib/videoMatching'
import { useVideoAnalysis } from '../hooks/useVideoAnalysis'
import { useVideoSelection } from '../hooks/useVideoSelection'
import { ANALYSIS_FPS, samplingPlan } from '../lib/sampling'
import { validateVideoFile } from '../lib/videoSource'
import { VocalExpressionTimeline } from '../../vocal/components/VocalExpressionTimeline'
import { AnalysisControls } from './AnalysisControls'
import { selectedAnalyses, modeForSelection } from '../lib/analysisSelection'
import type { AnalysisMode } from './AnalysisControls'

import { AnalysisSummary } from './AnalysisSummary'
import { formatTime } from '../lib/format'
import type { AnalysisSession } from '../types'

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
type VideoInput = { file: File; source: 'upload' | 'live' }
type Replacement =
  | { kind: 'video'; file: File; source?: 'upload' | 'live'; analyze?: boolean }
  | { kind: 'reanalyze' }
export function VideoWorkspace() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const offlineVideoRef = useRef<HTMLVideoElement>(null)
  const analysis = useVideoAnalysis()
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('facial')
  const [language, setLanguage] = useState<Language>('auto')
  const upload = useVideoSelection(analysis.reset)
  const [recordingOpen, setRecordingOpen] = useState(false)
  const [recordingDraft, setRecordingDraft] = useState<RecordedVideo | null>(null)
  const analyzeAfterLoad = useRef<VideoInput | null>(null)
  const [sessionIOBusy, setSessionIOBusy] = useState(false)
  const [replacement, setReplacement] = useState<Replacement | null>(null)
  const [approvedVideoId, setApprovedVideoId] = useState<string | null>(null)
  const [reviewRevision, setReviewRevision] = useState(0)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const selected = upload.selection,
    metadata = selected?.metadata,
    session = analysis.session
  const differences =
    session?.video && selected?.metadata
      ? videoDifferences(session.video, describeVideo(selected.file, selected.metadata))
      : []
  const connected =
    !!selected &&
    !!metadata &&
    !selected.error &&
    (!session ||
      selected.purpose === 'analysis' ||
      approvedVideoId === selected.id ||
      (!!session.video && differences.length === 0))
  const controlsBusy = sessionIOBusy || !!replacement
  const total =
    analysis.progress?.totalFrames ?? (metadata ? samplingPlan(metadata.durationMs).totalFrames : 0)
  const processed = analysis.progress?.processedFrames ?? 0
  const percent = total ? (processed / total) * 100 : 0
  const restore = (value: AnalysisSession) => {
    analyzeAfterLoad.current = null
    upload.remove({ preserveSession: true })
    setApprovedVideoId(null)
    setReplacement(null)
    setSelectionError(null)
    setReviewRevision((old) => old + 1)
    if (value.selectedAnalyses) setAnalysisMode(modeForSelection(value.selectedAnalyses))
    if (value.transcription) setLanguage(value.transcription.selectedLanguage)
    analysis.restore(value)
  }
  const chooseVideo = (file: File) => {
    try {
      analyzeAfterLoad.current = null
      validateVideoFile(file)
      setSelectionError(null)
      if (session) setReplacement({ kind: 'video', file })
      else upload.select(file)
    } catch (cause) {
      setSelectionError(cause instanceof Error ? cause.message : 'Could not open this video.')
    }
  }
  const beginAnalysis = () => {
    if (selected && metadata)
      void analysis.start(
        selected.url,
        describeVideo(selected.file, metadata),
        selected.purpose === 'reconnect' && session ? session.source : selected.source,
        {
          ...selectedAnalyses(analysisMode),
          language,
          file: selected.file,
        },
      )
  }
  const { start: startAnalysis, busy: analysisBusy } = analysis
  // Analyze only after the user selected Analyze Recording and the same shared
  // preview/metadata path has prepared that File. No inference happens on Stop.
  useEffect(() => {
    const pending = analyzeAfterLoad.current
    if (
      !pending ||
      !selected ||
      selected.file !== pending.file ||
      !metadata ||
      selected.error ||
      recordingOpen ||
      analysisBusy
    )
      return
    analyzeAfterLoad.current = null
    void startAnalysis(selected.url, describeVideo(selected.file, metadata), pending.source, {
      ...selectedAnalyses(analysisMode),
      language,
      file: selected.file,
    })
  }, [selected, metadata, recordingOpen, analysisBusy, startAnalysis, analysisMode, language])
  const acceptRecording = (recording: RecordedVideo) => {
    setRecordingDraft(recording)
    setRecordingOpen(false)
    if (session)
      setReplacement({ kind: 'video', file: recording.file, source: 'live', analyze: true })
    else {
      analyzeAfterLoad.current = { file: recording.file, source: 'live' }
      upload.select(recording.file, { source: 'live' })
    }
  }
  if (recordingOpen)
    return (
      <RecordingPanel
        initial={recordingDraft}
        onClose={(recording) => {
          setRecordingDraft(recording)
          setRecordingOpen(false)
        }}
        onAnalyze={acceptRecording}
        analysisControls={
          <AnalysisControls
            mode={analysisMode}
            language={language}
            disabled={false}
            onModeChange={setAnalysisMode}
            onLanguageChange={setLanguage}
          />
        }
      />
    )
  return (
    <>
      <section className="analysis-card" aria-labelledby="upload-title">
        <div className="analysis-section-heading">
          <h2 id="upload-title">Your interview video</h2>
          <span className="local-processing-badge">ON YOUR DEVICE</span>
        </div>
        <p>
          Analyze a local video or import a saved session to review its results without running
          inference.
        </p>
        <label className="video-file-picker">
          {session ? 'Analyze another video' : selected ? 'Replace video' : 'Upload Video'}
          <input
            type="file"
            aria-label={
              session ? 'Analyze another video' : selected ? 'Replace video' : 'Choose a video'
            }
            accept="video/*,.mp4,.webm,.mov,.m4v,.ogv"
            disabled={controlsBusy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) chooseVideo(file)
            }}
          />
        </label>
        <button
          className="product-button secondary recording-entry"
          disabled={controlsBusy || analysis.busy}
          onClick={() => {
            analyzeAfterLoad.current = null
            videoRef.current?.pause()
            setRecordingOpen(true)
          }}
        >
          {recordingDraft ? 'Review recording' : 'Record Video'}
        </button>
        <SessionActions
          session={session}
          disabled={analysis.busy || !!replacement}
          onRestore={restore}
          onBusyChange={setSessionIOBusy}
        />
        {replacement && (
          <section className="session-confirmation" aria-label="Confirm analysis replacement">
            <h3>
              {replacement.kind === 'video'
                ? 'Replace the current analysis?'
                : 'Run the selected analysis again?'}
            </h3>
            <p>
              {replacement.kind === 'video'
                ? `Selecting ${replacement.file.name} will clear the current session.`
                : 'Only the selected analyses will run again. Other successful results remain in this session.'}{' '}
              Keep the current session if you want to export it first.
            </p>
            <div className="analysis-actions">
              <button
                className="product-button"
                onClick={() => {
                  const action = replacement
                  setReplacement(null)
                  if (action.kind === 'video') {
                    analyzeAfterLoad.current = action.analyze
                      ? { file: action.file, source: action.source ?? 'upload' }
                      : null
                    upload.select(action.file, { source: action.source ?? 'upload' })
                  } else beginAnalysis()
                }}
              >
                {replacement.kind === 'video' ? 'Replace analysis' : 'Run selected analysis'}
              </button>
              <button className="product-button secondary" onClick={() => setReplacement(null)}>
                Keep current analysis
              </button>
            </div>
          </section>
        )}
        {(selectionError || upload.error || selected?.error) && (
          <p className="analysis-error" role="alert">
            {selectionError || upload.error || selected?.error}
          </p>
        )}
        {session && (
          <div className="saved-session-info">
            <h3>Active session</h3>
            <p>
              {session.samples.length > 0
                ? `Model ${session.modelVersion} · ${session.samplingFps} FPS`
                : `Facial analysis: ${session.facialStatus ?? 'not-requested'}`}{' '}
              · {formatTime(session.durationMs)} · Created {session.createdAt}
            </p>
            {session.video && (
              <p>
                Saved video: <strong>{session.video.filename}</strong> ·{' '}
                {fileSize(session.video.sizeBytes)} · {session.video.width} × {session.video.height}
              </p>
            )}
            <label className="session-file-action">
              Select Original Video
              <input
                type="file"
                accept="video/*,.mp4,.webm,.mov,.m4v,.ogv"
                disabled={controlsBusy || analysis.busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) upload.select(file, { preserveSession: true })
                }}
              />
            </label>
          </div>
        )}
        {selected && (
          <>
            <video
              key={selected.id}
              ref={videoRef}
              className="video-preview"
              src={selected.url}
              controls
              playsInline
              preload="metadata"
              aria-label="Selected video preview"
              onLoadedMetadata={(event) => upload.readMetadata(selected.id, event.currentTarget)}
              onLoadedData={(event) => upload.readMetadata(selected.id, event.currentTarget)}
              onError={() => upload.decodeFailed(selected.id, { preserveSession: !!session })}
            />
            {session &&
              selected.purpose === 'reconnect' &&
              metadata &&
              !selected.error &&
              differences.length > 0 &&
              approvedVideoId !== selected.id && (
                <section className="session-confirmation" aria-label="Video metadata mismatch">
                  <h3>This video does not match the saved metadata</h3>
                  <ul>
                    {differences.map((difference) => (
                      <li key={difference}>{difference}</li>
                    ))}
                  </ul>
                  <p>
                    This preview is not linked to the timeline. Using a different video may misalign
                    the results.
                  </p>
                  <button
                    className="product-button secondary"
                    disabled={controlsBusy || analysis.busy}
                    onClick={() => setApprovedVideoId(selected.id)}
                  >
                    Use this video anyway
                  </button>
                </section>
              )}
            {session && connected && (
              <p className="analysis-small">
                Video connected. Metadata matching is not cryptographic verification of identical
                content.
              </p>
            )}
          </>
        )}
        {session && !connected && (
          <div className="session-video-placeholder">
            <h3>No video connected</h3>
            <p>
              The original video is not included in session JSON. You can explore the saved timeline
              and statistics now, or select the original video to restore playback.
            </p>
          </div>
        )}
        {session && (
          <ExpressionTimeline
            key={`${session.id}:${reviewRevision}`}
            session={session}
            videoRef={connected ? videoRef : offlineVideoRef}
            videoConnected={connected}
          />
        )}
        {session && (
          <VocalExpressionTimeline
            vocal={session.vocal}
            durationMs={session.durationMs}
            videoRef={connected ? videoRef : offlineVideoRef}
            videoConnected={connected}
          />
        )}
        {session && (
          <TranscriptTimeline
            key={`speech:${session.id}:${reviewRevision}`}
            transcription={session.transcription}
            videoRef={connected ? videoRef : offlineVideoRef}
            videoConnected={connected}
          />
        )}
        {selected && (
          <>
            <dl className="video-metadata">
              <div>
                <dt>File</dt>
                <dd>{selected.file.name}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{fileSize(selected.file.size)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{metadata ? formatTime(metadata.durationMs) : 'Reading metadata…'}</dd>
              </div>
              <div>
                <dt>Resolution</dt>
                <dd>{metadata ? `${metadata.width} × ${metadata.height}` : '—'}</dd>
              </div>
            </dl>
            <AnalysisControls
              mode={analysisMode}
              language={language}
              disabled={analysis.busy || controlsBusy}
              onModeChange={setAnalysisMode}
              onLanguageChange={setLanguage}
            />
            <p className="analysis-small">
              Audio analyses run after recording, on your device, in sequence. Whisper and the
              selected vocal model load from this application only when requested and may be cached.
              Audio is never uploaded. Vocal categories describe acoustic patterns, not a person’s
              actual emotional state.
            </p>
            <div className="analysis-actions">
              {(!session || connected) && (
                <button
                  className="product-button"
                  disabled={!metadata || !!selected.error || analysis.busy || controlsBusy}
                  onClick={() => {
                    if (session) setReplacement({ kind: 'reanalyze' })
                    else beginAnalysis()
                  }}
                >
                  {session
                    ? 'Analyze again'
                    : selected.source === 'live'
                      ? 'Analyze Recording'
                      : 'Analyze video'}
                </button>
              )}
              <button
                className="product-button secondary"
                disabled={controlsBusy || analysis.busy}
                onClick={() => {
                  upload.remove({ preserveSession: !!session })
                  setApprovedVideoId(null)
                }}
              >
                {session ? 'Disconnect video' : 'Remove video'}
              </button>
              {selected.source === 'live' && (
                <button
                  className="product-button secondary"
                  onClick={() => {
                    try {
                      downloadRecording(selected.file)
                    } catch {
                      setSelectionError('Could not download the recording. Try again.')
                    }
                  }}
                >
                  Download Video
                </button>
              )}
            </div>
            <p className="analysis-small">
              Facial sampling: {ANALYSIS_FPS} FPS. Playback and seeking never rerun inference.
            </p>
          </>
        )}
      </section>
      {((analysis.status !== 'idle' && (analysis.status !== 'completed' || !!session)) ||
        analysis.busy) && (
        <section className="analysis-card" aria-labelledby="progress-title">
          <h2 id="progress-title">Analysis progress</h2>
          <p role="status">
            {analysis.busy && analysis.status !== 'cancelled'
              ? analysis.stage
              : analysis.busy && analysis.status === 'idle'
                ? 'Finishing the previous job before another can start…'
                : analysis.status === 'loading'
                  ? 'Loading video data and local facial models…'
                  : analysis.status === 'analyzing'
                    ? 'Analyzing sampled frames…'
                    : analysis.status === 'cancelled'
                      ? analysis.busy
                        ? 'Cancelling safely; waiting for the current operation to finish…'
                        : 'Analysis cancelled. You can start again.'
                      : analysis.status === 'completed'
                        ? hasAnalysisIssues(session)
                          ? 'Processing finished with errors. Successful results have been retained.'
                          : 'Analysis complete.'
                        : 'Analysis could not finish.'}
          </p>
          {analysis.progress && (
            <>
              <progress
                className="analysis-progress"
                aria-label="Video analysis progress"
                max={100}
                value={percent}
              />
              <p>
                {percent.toFixed(1)}% · {processed} / {total || '—'} frames processed · Video
                timestamp {formatTime(analysis.progress?.timestampMs ?? 0)}
              </p>
            </>
          )}
          {analysis.busy && analysis.status !== 'cancelled' && (
            <button className="product-button secondary" onClick={analysis.cancel}>
              Cancel analysis
            </button>
          )}
          {analysis.error && (
            <p className="analysis-error" role="alert">
              {analysis.error}
            </p>
          )}
        </section>
      )}
      {session?.facialError && (
        <p className="analysis-error" role="alert">
          {session.facialError}
        </p>
      )}
      {session && (session.samples.length > 0 || session.facialStatus === 'completed') && (
        <AnalysisSummary session={session} />
      )}
    </>
  )
}
