# Phase 5B — session speech integration

The product at `https://localhost:5174/` now offers **Facial expressions**, **Speech transcription**, or **Facial expressions + speech (sequential)**. The default remains facial-only. Language choices are Auto, English and Spanish. A completed recording exposes the same controls before Analyze Recording. No speech inference runs during recording or native Stop finalization.

## Architecture and files

- `lib/{audio,core,client,protocol,stt.worker}.ts`: moved, reusable Phase 5A implementation. The multilingual `onnx-community/whisper-tiny`, q8, Transformers.js 4.3.2, WASM reference backend, native decode/mono/verified 16-kHz preprocessing and built-in 30-second/5-second-stride merging are retained. Original experiment modules forward to these modules, so `/experiments/stt/` still works with its experimental WebGPU option. There is one model-inference implementation.
- `lib/transcribeVideo.ts`: UI-independent, lazy Worker/audio service receiving the completed local File, language, video duration and AbortSignal. Model loading/progress, audio preparation, inference, timestamp validation and teardown are explicit. The model is disposed after a successful run; failure/abandonment terminates the Worker. Cached weights can be reused on retry. Native/GPU resource reclamation is not guaranteed to finish immediately.
- `types.ts`: terminal session transcription status, selected/detected language, text, segments, warnings/errors and optional actual runtime metadata. Detection is **null** because this pipeline does not reliably expose the detected language, including in Auto mode. Explicitly selecting a language does not invent a detected-language value.
- `../analysis/lib/runSessionAnalyses.ts`: sequential orchestration with independent outcomes and incremental publication. It preserves the session ID, video metadata and other modality. Failed retries retain earlier successful results, while exposing retry errors. Cancelled/replaced jobs cannot publish into newer sessions.
- `../analysis/{types.ts,hooks/useVideoAnalysis.ts,components/AnalysisControls.tsx,components/VideoWorkspace.tsx}`: analysis selection, shared session state, stages/progress, retry and cancellation. `../recording/components/RecordingPanel.tsx` accepts the same controls in completed-preview mode; capture/encoding/downloading logic is unchanged.
- `components/TranscriptTimeline.tsx` / `transcript.css`: full text, clickable timestamped segments, gaps, active segment and the existing native video clock. Expression navigation and transcript seeking use the same video ref and milliseconds relative to the video. Playback/navigation never triggers inference. Without original media, imported text/segments remain readable, with seeking disabled until reattachment.
- `../sessions/lib/serialization.ts`: explicit v1 migration, strict v2 validation and whitelist export. SessionActions explains that JSON now contains transcript text.
- `apps/web/index.html`: permits same-origin connections and the local runtime's blob module imports for requested STT. Both entry pages now use `connect-src 'self'`; Whisper files are self-hosted and remote model fallback is disabled. Raw local PCM is transferred only to the dedicated local Worker. No backend, cloud transcription API, persistent transcripts or new dependencies were introduced by Phase 5B.

The Lab, shared facial classifier, model weights, facial sampling/inference rules and experiment model configuration are unchanged.

## Session JSON version 2

The envelope is `{ schemaVersion: 2, exportedAt, session }`. Existing video metadata and facial samples keep their representation. Sessions add:

```ts
facialStatus: 'not-requested' | 'completed' | 'error' | 'cancelled'
facialError?: string
transcription: {
  status: 'not-requested' | 'completed' | 'error' | 'cancelled'
  selectedLanguage: 'auto' | 'english' | 'spanish'
  detectedLanguage: string | null
  text: string
  segments: { startMs: number; endMs: number; text: string }[]
  timestampWarning?: string
  error?: string
  metadata?: {
    modelId: string
    backend: 'wasm' | 'webgpu'
    inferenceMs: number
    loadMs: number
    audioDurationMs: number
  }
}
```

Running stages live in the analysis controller; exported data uses terminal outcomes. Export/import is disabled while processing. A failed retry can retain `status: completed` plus an error explaining that the previous result remains available. The selected/detected language on that retained result describes the successful run, not the failed attempt.

`migrateVersion1Session` validates the original v1 whitelist, preserves every stored facial sample/uncertainty decision, and supplies completed facial status plus an empty **not-requested** transcription (Auto / detected null). It does not run models or fabricate speech. Every new export is v2. V2 requires explicit statuses and transcription fields; speech-only sessions use empty facial samples, `facialStatus: not-requested`, and `modelVersion: not-run`. Facial-only sessions use empty not-requested transcription. Metadata remains mandatory for reconnecting a saved video.

Segments must have finite video-relative bounds, positive duration, nonempty text, increasing non-overlapping intervals within the video. Unknown versions/fields, malformed records, excessive size/counts and inconsistent facial probabilities are rejected. Gaps, empty completed transcription, and completed full text without reliable timestamps are valid. The inference normalizer can report missing/invalid timestamps while retaining full text; imports validate stored segments rather than silently repairing them. No File, audio/video bytes, object URLs, model objects or runtime handles are exported. Import and original-video reattachment never call either model.

## Manual validation

Run `npm run dev:web` with Node >=22.12; HTTPS certificates must be configured as before.

1. **Upload**: choose a short spoken MP4/WebM. Select both analyses and English/Spanish. Start Analyze video. Confirm facial stages finish before Whisper loading/preparation/inference, successful facial results appear before speech finishes, and both remain in one session. Use Network to verify model/config downloads but no audio uploads.
2. **Navigation**: play/pause/seek; click several transcript segments and expression events. Check both follow the same player, no segment is highlighted during speech gaps, no inference reruns, and the end of the recording stays aligned. Auto is experimental; compare explicit language selection for controlled evaluation.
3. **Independent runs**: start facial-only then speech-only using Analyze again → Run selected analysis. Confirm adding speech preserves samples/ID, rerunning facial preserves the transcript, and successful retries clear their corresponding error. Try a no-audio/unsupported-codec video: facial success remains available even if speech fails. Try a facial-model loading failure: completed speech remains usable. Empty speech output is displayed without claiming proof that speech was absent.
4. **Recording**: Record Video → Enable camera & microphone → Start/Stop. Confirm devices stop and final output is playable, then choose both analyses in the completed preview and Analyze Recording. Confirm no Whisper activity before that explicit action. Download Video, inspect both timelines and export the session (`source: live`).
5. **Portability**: export v2, reload/import, verify text/samples/timings without inference; Select Original Video restores both timelines. Repeat with facial-only, speech-only and old v1 JSON. Check mismatch confirmation, corrupt/unsupported JSON, invalid segment boundaries, replacement, disconnect and subsequent retry. Video/audio are separate downloads, never embedded in session JSON.
6. **Abandonment**: cancel during model load, native decode and inference, then replace/import/start again. Confirm no late results overwrite the active session and already successful results remain. Resource reclamation may finish later; native decoding can keep the job busy until it settles.
7. **Regression**: open `/experiments/stt/`, explicitly load WASM, run the same English/Spanish clips and verify its transcript/metrics/seek controls still work.
8. **Physical mobile**: repeat upload and completed recording on the actual iPhone Chrome/Safari and Android Chrome devices available. Record device/OS/browser, codec, cold/warm load, processing time, errors, playback timing, memory failures and background/tab-switch behavior. Desktop/mocked tests do not establish mobile compatibility.

## Checks and limits

Tests cover v1 migration/v2 round-trip, speech-only/facial-only/empty transcription, strict segment validation, single-session identity, sequential operation, partial failure, retained successful retries, missing audio, model initialization failure, cancellation, shared playback/gaps/seeking, upload/recording handoff and import without inference. Phase 5A's preprocessing/protocol tests still exercise the shared implementation through the compatibility entries.

Browser limitations are retained: native codec support, browser model cache eviction, limited device memory, and model-generated approximate timestamps. The validated spike's **250 MiB / five-minute audio limit** remains; longer recordings can still receive facial analysis but speech reports its limit. Native decoding allocates source buffers before duration can be checked. Audio duration grossly inconsistent with video is rejected; timestamps are never stretched. Container track offsets/edit lists need manual synchronization checks because native audio decoding may normalize track start. A successful empty Whisper result is not a speech detector, and Whisper may hallucinate text in silence/noise.

The user reported Phase 5A desktop validation: Spanish 17.32 s / inference 3.97 s / RTF .229; English 60.05 s / inference 18.84 s / RTF .314, with good text/timing. These are supplied spike measurements, not measurements newly taken during Phase 5B. Integrated real-media and physical-mobile validation above remains required. No Phase 5C, diarization, voice emotion analysis or reports were implemented.

## Self-hosted model assets

Whisper is now served exclusively from the app origin, with pinned assets, a reproducible development-time downloader, SHA-256 build checks and versioned browser caching. See [asset manifest, paths, size, caching and production verification](../../../WHISPER_ASSETS.md). The inference backend, model bytes and preprocessing/transcription settings remain unchanged.
