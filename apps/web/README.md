# ExpressionLens Web App

The user-facing app supports local video/audio recording, offline video analysis, a synchronized expression timeline, and portable analysis sessions. Run it from the project root with `npm run dev:web`, then open [https://localhost:5174/](https://localhost:5174/). See the [root README](../../README.md) for installation and HTTPS setup.

## Save and reopen results

1. Choose a local video and complete analysis.
2. Use **Export Session** to download a human-readable `interview-mirror-session-YYYY-MM-DD.json` file.
3. On this page or another device, use **Import Session** and choose that JSON. Statistics, intervals, tooltip prediction details and event navigation are regenerated from the recorded samples. No model or inference is initialized to import/review results.
4. If a session is already active, the new file is validated first. **Replace session** clears the existing video connection; **Keep current session** leaves it intact. Failed imports leave both the active results and its current video untouched. Export remains available while the replacement confirmation is displayed.
5. Without a connected video, the placeholder explains what is missing. The timeline still supports hover, touch/keyboard exploration and Previous/Next event navigation. Its position is a review cursor, not an active playback clock.

Only a completed active session can be exported. Import is disabled while analysis is running; cancel and wait for resource cleanup first. Choosing a video for a new analysis or requesting reanalysis also asks before clearing an existing session. There is no automatic database, session library, cloud backup, or localStorage persistence. Keep the JSON if you want to reopen it later.

## Reconnect the original video

Session JSON contains metadata and numerical predictions, **not video data**, thumbnails, audio or blob URLs. Browsers cannot reopen a previously selected local file automatically, including on the original device.

Use **Select Original Video**. The selected file is previewed locally, and its name, byte size, resolution and available MIME type are compared to the saved metadata. Duration differences up to **250 ms inclusive** are accepted for browser metadata rounding. Compatible metadata links the video automatically; playback and timeline then synchronize using the existing HTMLVideoElement.

If metadata differs, the preview remains **unlinked** and the timeline stays in offline review mode. Read the listed differences and choose **Use this video anyway** to explicitly associate it. Results are not changed or recomputed; a different/shorter video may not align with the recorded timeline. Matching metadata is **not cryptographic verification** that the content is identical.

**Disconnect video** releases the local object URL and keeps the results, statistics, export action and offline timeline. Selecting/replacing a candidate video never overwrites the original saved metadata. Starting a new analysis records the selected file's actual metadata in its new session. A failed candidate decode preserves saved results.

## Original portable JSON schema v1 (still supported)

Current exports use schemaVersion 3; versions 1 and 2 remain importable. See the Phase 6B section below for vocal fields. The historical v1 envelope contains exactly `schemaVersion`, `exportedAt` and `session`. This format is separate from Dataset Collector and Blendshape Inspector exports.

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-11-03T12:10:00.000Z",
  "session": {
    "id": "example-session-id",
    "source": "upload",
    "createdAt": "2026-11-03T12:00:00.000Z",
    "durationMs": 600,
    "modelVersion": "v3",
    "samplingFps": 5,
    "video": {
      "filename": "interview.mp4",
      "sizeBytes": 12345,
      "durationMs": 600,
      "width": 1280,
      "height": 720,
      "mimeType": "video/mp4"
    },
    "samples": [
      {
        "status": "detected",
        "timestampMs": 0,
        "label": "uncertain",
        "rawLabel": "neutral",
        "confidence": 0.55,
        "margin": 0.11,
        "isUncertain": true,
        "distribution": [
          { "label": "neutral", "probability": 0.55 },
          { "label": "smile", "probability": 0.008 },
          { "label": "surprise", "probability": 0.002 },
          { "label": "angry", "probability": 0.44 }
        ]
      },
      { "status": "no-face", "timestampMs": 200 },
      { "status": "multiple-faces", "timestampMs": 400 }
    ]
  }
}
```

- Timestamps and duration are milliseconds; probabilities remain full-precision JSON numbers. Export does not round, normalize or reinterpret predictions.
- `source` accepts `upload | live`; recorded videos use live and share the same session contract as uploaded files.
- `createdAt` and `exportedAt` are ISO-8601 timestamps. `id` and `modelVersion` are bounded non-empty identifiers.
- Video metadata is required in exports/imports. `mimeType` is optional; all other displayed video fields are required. The session/video durations must agree within 1 ms. The original filename is metadata only, never a filesystem permission or automatic file access.
- A detected sample preserves all existing prediction fields. Four probabilities must be in canonical order **neutral, smile, surprise, angry**, finite and in [0,1], with sum tolerance 0.001 matching the inference contract. Raw argmax, confidence and margin must agree with those probabilities (numeric comparison tolerance 0.000001).
- `label` accepts those four categories or `uncertain`. `rawLabel` is always one of the four trained classes. `isUncertain` must agree with the interpreted label; a non-uncertain label must equal its raw argmax. Recorded interpretation is preserved as historical data, not recomputed against a current threshold or model version.
- `no-face` and `multiple-faces` samples have only status and timestamp. They do not acquire invented probabilities or a neutral/uncertain class.
- Sample timestamps must be finite, non-negative, strictly increasing and **before** session duration. Missing sampling periods remain allowed and appear as Not analyzed; validation never fills gaps or discards bad samples.
- Imports reject unsupported versions, missing/unknown fields, wrong types and invalid records with a readable error. A schema migration must be explicit; future schema extensions should introduce a new supported version rather than silently repairing incompatible data.

Limits: **50 MiB JSON**, **50,000 samples**, positive duration at most **24 hours**, positive sampling rate at most **60 FPS**, positive integer file size, and positive integer dimensions at most 32768 pixels per axis. These are portable-file bounds, not changes to the inference model. Every record is validated once before replacing the active session. All runtime-only fields are excluded by the export whitelist: no React state, DOM/media objects, tensors, raw frames, video bytes, object URLs or datasets are serialized. Derived statistics/intervals are recomputed instead of stored redundantly.

## Privacy

Everything stays in the browser until you explicitly download a file. Exported results may contain sensitive behavioral information and the original filename. You control where JSON/video files are stored and whom you share them with. Sharing only JSON still shares expression observations, but does not include the original recording. There is no automatic upload or persistent browser storage.

## Implementation and validation

The existing `AnalysisSession` is reused with optional source metadata, required by the portable contract. `features/sessions/lib/serialization.ts` defines schema v1, validation, whitelisted export and safe object URL download cleanup; `videoMatching.ts` handles metadata comparison. `SessionActions.tsx` handles import/export and validated replacement confirmation. The analysis hook can restore a normalized session without calling the analysis runner. Video selection supports non-destructive reconnection/disconnection. The same timeline, tooltips and statistics handle both origins; an offline review cursor is used only when no native video is connected.

Automated tests cover precision/round-trip preservation, all detection statuses, unknown fields and malformed data, limits, cyclic runtime extras, reconstructed statistics/intervals, offline prediction navigation, valid and mismatched reconnection, explicit confirmations, failed-import preservation, stale video callbacks, blob cleanup and no inference during restoration/reconnection.

Manual browser checks still needed:

1. Analyze a short video, export, import its JSON and compare all counts/timestamps/details.
2. Confirm replacement/cancellation prompts preserve the active analysis and selected video as described.
3. Reconnect the same file, verify native playback/seeks and timeline synchronization; try a renamed/different file and approve/reject its mismatch.
4. Disconnect, explore without video, reconnect again, and check desktop/iPhone file picking, codec behavior and download completion.
5. Try malformed/oversized JSON and refresh the page to verify no automatic persistence.

Run `npm run typecheck`, `npm test`, `npm run lint`, `npm run build:web`, `npm run build:lab`, and `npm run verify:web` from the project root. The Lab, shared classifier, v3 weights, uncertainty threshold and model evaluation remain unchanged.

## Phase 4: local video and audio recording

On the initial screen, choose **Upload Video** or **Record Video**; Import Session remains available. Recording opens a dedicated interface and does **not** request permissions or initialize inference on mount. Press **Enable camera & microphone** to explicitly request both devices. The application prefers a front-facing 1280×720 camera at 30 FPS with echo cancellation/noise suppression, but the browser negotiates the actual capabilities. It does not impose exact dimensions/frame rate.

1. Open Record Video and enable the devices. The live preview is muted and `playsInline` to prevent microphone feedback. If preview playback is blocked, use **Resume camera preview**.
2. Press **Start Recording**. A recording indicator and elapsed time appear. The configurable `RECORDING_LIMIT_MS` in `features/recording/lib/formats.ts` defaults to **10 minutes**; reaching it requests a graceful stop. There is no recording file-size cap or transcoding, but recordings consume browser memory.
3. Press **Stop Recording**. Camera/microphone tracks are released immediately after requesting the native stop; data/stop listeners remain until finalization, so the final chunk is not discarded. The interface waits for the final native events before creating the playable File/preview.
4. Review using native video/audio playback controls. **Download Video** saves the complete File with the actual container extension and original encoded bytes/audio, without re-encoding. Download before closing the page if you want to keep the recording.
5. **Analyze Recording** explicitly passes that File into the existing selected-video/metadata path, then starts the same offline seek → sample → MediaPipe → v3 pipeline. No inference runs during permission requests, camera preview, recording or Stop. If another session is active, confirm replacement first. Cancelling replacement retains the recording as a draft accessible through **Review recording**.
6. **Back** from completed preview retains one recording draft in page memory, releasing its preview URL and all device resources. **Retake Recording** explicitly replaces that draft; download first to keep a copy. Cancelling while recording discards that take and releases devices. Leaving/reloading the app cannot retain media automatically: there is no persistent media storage.

### Native format and lifecycle behavior

`MediaRecorder.isTypeSupported()` negotiates audio-capable WebM VP9/Opus, WebM VP8/Opus, MP4 H.264/AAC, or generic WebM/MP4. Unsupported preferred types fall back to the browser's default configuration; constructor failure with a preferred encoder also tries the default. Actual chunk/recorder MIME determines the filename (`.webm`, `.mp4`, `.ogv` or `.mkv`), not an assumed WebM suffix. If the browser omits all MIME information, the container header is checked for WebM/MP4. Unknown bytes are downloadable as `.bin`, with analysis disabled rather than pretending to know the format.

The controller has idle, requesting-permission, ready, recording, stopping, preview and error states. It prevents overlapping requests/recorders, ignores permission/finalization results after cancellation or unmount, removes recorder/track listeners and timers, revokes obsolete URLs and stops every owned camera/microphone track. React uses a small external-store hook; the controller is separate from any classifier code. Preview/disposal cleanup is compatible with StrictMode.

Track disconnection, native recording errors, page hide or tab/app switching request a stop and preserve available output when possible. A stopped recording may finalize only after the browser resumes its event loop. If native finalization never arrives, a 10-second watchdog releases resources and offers buffered data with an **incomplete recording** notice, or reports empty data. Browsers can interrupt/discard native captures outside the app's control; this is not a promise of uninterrupted background recording. Browser throttling can also delay duration-limit events. There is no automatic upload, cloud recording, audio visualization, transcription, voice analysis or live expression overlay.

Some MediaRecorder WebM output lacks a finite duration header. The common video metadata helper now uses a browser-native end seek and restores the decoded initial position to discover finite duration. It is shared by recorded preview, ordinary selected/reconnected files and the offline decoder; it does not patch/re-encode the Blob. If the browser cannot determine duration or decode the container, keep the original bytes with Download Video and try a compatible browser. The recording clock is a wall-clock indicator; analysis/export metadata uses decoded file duration.

### Reuse and session portability

Uploaded/recorded inputs share the selected-video File representation with `source: 'upload' | 'live'`. The analysis hook records the input origin while preserving the exact existing inference runner, feature ordering, model weights, uncertainty rule, progress/cancellation, timeline and statistics. Recorded results use **`source: 'live'`** in schema v1, which already supported that source; no schema bump was needed.

Download both the **video** and the **session JSON** to keep them. Importing a recorded session still restores predictions without inference. Reconnect the downloaded recording through Select Original Video. Metadata matching compares MIME container type without requiring the browser to reproduce codec-parameter text; all other file/duration/resolution checks and explicit mismatch confirmation remain in place. JSON contains no video or audio bytes.

### Files and checks

- `features/recording/lib/recorder.ts`: recording state machine, device/recorder lifecycle, limits, interruption handling and cleanup.
- `features/recording/lib/formats.ts`: single duration-limit constant, MIME negotiation, File assembly and video download.
- `features/recording/hooks/useRecording.ts` and `components/RecordingPanel.tsx`: permission/live/recorded preview, controls and local draft handoff.
- `features/recording/recording.css`: responsive live preview and recording indicator.
- Existing video selection/analysis hooks and VideoWorkspace: normalized origin, retained recording drafts and explicit post-record analysis using the same pipeline.
- Existing `videoSource.ts`: finite-duration discovery shared with uploads/reconnections.
- Existing video matching: codec-parameter tolerant MIME matching for downloaded originals.
- Recording/API/integration tests plus duration/matching regression coverage. The Lab and shared classifier were not changed; there are no new dependencies.

Manual browser validation remains required, particularly on **iOS Safari** and **Android Chrome**:

1. Use HTTPS (or localhost), grant camera+microphone access, and confirm the front camera/live muted inline preview. Permission denial, missing/busy devices and unsupported MediaRecorder must leave Upload Video usable. This workflow requests both devices; it does not silently fall back to audio-less capture.
2. Record a short spoken clip, stop, and replay with sound. Confirm the final seconds and audio are present, device indicators turn off, and the extension agrees with the actual native container. Check portrait/landscape behavior.
3. Download the recording, analyze it, check sample counts/timeline, export/import JSON (`source: live`) and reconnect the downloaded file without inference. Verify ordinary uploaded analysis still behaves as before.
4. Test Retake, Back/cancellation before permission resolves, unmount, device unplug, app switching/hidden tabs, and the duration limit. Check partial-output notices and that no camera/microphone remains active after exit.
5. Test short WebM/MP4 clips in the browsers that support them, including duration discovery and local download completion. Native encoding, audio playback and mobile interruptions cannot be established by mocked unit tests.

## Phase 5A — isolated speech-to-text experiment

Open **`/experiments/stt/`** on the Web server (HTTPS port 5174). It provides local audio/video decoding, explicit multilingual Whisper loading, WASM/WebGPU selection, transcription with segment seeking/highlighting, separate performance timings and abandonment. It does not modify facial analysis sessions or persist transcripts.

See [the spike documentation](src/experiments/stt/README.md) for runtime versions, quantization, codec/timestamp limitations, tests and the English/Spanish/long-recording/backend/physical-mobile experiment matrix. Real-browser quality and performance measurements remain pending.

## Phase 5B — facial and speech analysis in one session

The main Web workflow now offers facial-only, speech-only or sequential facial + speech analysis for uploaded and completed recorded videos. Select Auto/English/Spanish; Whisper initializes only when speech is requested. Transcript segments and expression events navigate the same player, and retries preserve the other modality's successful results.

**Current exports use schema v2.** The Phase 3 v1 description above is historical; v1 still imports through an explicit migration that supplies not-requested transcription. V2 supports facial-only and speech-only sessions. JSON includes text/segments and optional STT metadata, never raw video/audio. Import/reattachment runs no inference.

See [Phase 5B architecture, migration, files, manual workflows and mobile limitations](src/features/speech/README.md). The separate Phase 5A page remains available.

## Self-hosted Whisper

Whisper’s seven q8 assets are now included in `public/models/whisper-tiny-q8/<revision>/` (43,613,734 bytes). Both speech interfaces request them lazily from the application origin, with remote fallback disabled. Restore/verify them with `npm run assets:whisper` and `npm run assets:whisper:verify`. See [paths, browser caching and production checks](WHISPER_ASSETS.md). No Service Worker or complete offline mode is included.

## Phase 6A — Vocal Expression Lab

The isolated page `/experiments/vocal/` evaluates self-hosted Wav2Vec2 SUPERB ER q4 on WASM, with 3/5/10-second windows, all model category scores, synchronized media intervals, performance and in-memory clip comparisons. It does not modify product sessions. See [model research, license, assets, measured limitations and evaluation protocol](src/experiments/vocal/README.md). Restore assets with `npm run assets:vocal`.

## Phase 6B — Integrated vocal expressions

The product offers all seven nonempty combinations of facial, transcription and vocal analysis; facial-only remains the default. The configured SER model runs locally in a separate sequential worker, reusing decoded PCM with Whisper when both are selected. A compact vocal track shares the video clock/time scale with facial results and transcripts. Session v3 preserves vocal intervals/scores/configuration and imports v1/v2; successful outputs survive partial failures. Both experimental models remain at `/experiments/vocal/`. See [shared modules, schema, limits and manual checks](src/features/vocal/README.md).

## Provisional, reversible SER choice

Emotion2vec+ Base is now selected for product vocal analysis, with original nine-class scores and three-second windows. Both models remain fully available in the internal Lab and on disk. Set `ACTIVE_SER_MODEL` in `apps/web/src/features/vocal/config.ts` to `'wav2vec2'` to restore Wav2Vec2, or `'emotion2vec'` to select Emotion2vec. Historical sessions use their recorded model metadata, never the current setting. No removal or automatic winner selection is authorized by this switch.

## Pretrained model setup

Downloaded pretrained models are excluded from Git. After `npm ci`, run `npm run assets:setup` from the repository root before development or building. Exact download links, revisions, files and destination directories are listed in the [root README](../../README.md#download-and-place-pretrained-models). The small project-trained facial classifier v3 remains versioned. Prepared builds still self-host all model/runtime files; nothing is downloaded from external origins during browser inference.
