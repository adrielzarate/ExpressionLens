# Phase 6B — Integrated vocal expression analysis

The product at `https://localhost:5174/` offers seven nonempty combinations of facial expression, transcription, and vocal expression analysis. Facial-only remains the default. Uploaded videos and completed browser recordings pass through the same orchestration. Vocal analysis provisionally uses **Emotion2vec+ Base FP32**. Both models are retained; there is no product model selector. No automatic winner selection or fallback is performed.

## Reversible product model setting

Change **one value** in `apps/web/src/features/vocal/config.ts`:

```ts
export const ACTIVE_SER_MODEL: VocalModelKey = 'emotion2vec'
```

To restore Wav2Vec2, change only `'emotion2vec'` to `'wav2vec2'` and rebuild/reload the application. The Lab's selector is independent. No inference, UI, session validator or model assets need editing. Switching does not rerun or reinterpret saved sessions. Neither adapter, weight set, manifest, dependency nor test has been removed. Removing either model requires separate explicit approval after manual evaluation.

`models.ts` is the shared registry for model IDs/revisions, precision, original label order, preprocessing identity, display names and colors. The product and Lab use the same registry and common `VocalModelInstance` inference interface. `loadModel.ts` dynamically imports only the requested adapter, and `worker.ts` maintains at most one loaded instance. A failed Emotion2vec run remains an explicit error; it never automatically replaces the chosen model with Wav2Vec2.

Emotion2vec preserves **angry, disgusted, fearful, happy, neutral, other, sad, surprised, unknown** and all nine original scores. Its FP32 encoder already normalizes 16-kHz PCM; the existing adapter mean-pools frame embeddings and applies the published linear head/softmax. No Wav2Vec2 preprocessing or four-class mapping is applied to those outputs. `unknown` is a native model category, distinct from a silent/failed/unclassified interval.

Existing v3 Wav2Vec2 sessions (q4; `neu`, `hap`, `ang`, `sad`) still validate and render using their recorded provenance. New v3 sessions include the selected model ID, revision, dtype, labels and preprocessing identity. The optional preprocessing field remains absent when importing/reexporting older sessions that lacked it. Validation and timeline presentation resolve the **recorded model**, never `ACTIVE_SER_MODEL`, so old outputs remain byte-for-byte numerical records without reclassification. v1/v2 behavior remains unchanged.

## Shared implementation

- `lib/wav2vec.ts`: the original Phase 6A Transformers.js loader, actual config/label inspection, raw PCM preprocessing and one softmax through the existing audio-classification pipeline. The model, q4 weights, revision, labels (`neu`, `hap`, `ang`, `sad`), `do_normalize: false`, 16-kHz input and WASM settings are unchanged.
- `lib/core.ts`: original tested window segmentation, AC RMS gate, score preservation, margins, silent/short/failed states and sequential inference. The experiment reexports this module instead of keeping a copy.
- `lib/client.ts`, `lib/protocol.ts`, `lib/worker.ts`, `lib/loadModel.ts`: shared worker lifecycle, one-operation protocol and lazy adapter dispatch. The product entry uses `ACTIVE_SER_MODEL`; the Lab entry keeps its selector and Wav2Vec2 initial default.
- `lib/emotion2vec.ts`, `lib/emotion-head.ts`: existing FP32 ONNX/head implementation shared by both entrypoints. Original Lab import paths remain forwarding modules, with their tests retained. The existing Emotion2vec manifest and public assets are preserved at their original locations.
- `assets.json`: moved pinned Wav2Vec2 manifest; public asset URLs, hashes and bytes are unchanged. The build-time asset verifier now reads the shared manifest. Both Wav2Vec2 and Emotion2vec remain available at `/experiments/vocal/`.
- `lib/analyzeVocal.ts`: product integration, cancellation, decoded-duration checks, fixed 3-second non-overlapping windows (`stepMs: 3000`, `overlapMs: 0`), RMS `.0001`, media-relative intervals, model provenance and disposal.
- `features/speech/lib/audio.ts`: existing native decoder, mono conversion and verified 16-kHz resampling. No Whisper features are fed to Wav2Vec2.

## Execution and memory

`runSessionAnalyses` runs facial → transcription → vocal stages, skipping unselected modalities. Facial sessions are disposed before audio models run; the Whisper worker is disposed/terminated before the configured vocal model loads. A new worker is created only after an explicit selected analysis starts. Playback/import never loads models.

When transcription and vocal analysis are both selected, media is decoded once after the facial stage. Whisper receives one copy of the 16-kHz PCM because transferring its buffer would detach the waveform still needed by the vocal model. The original is transferred to the final vocal worker. This small waveform copy avoids a second native decode and avoids keeping two inference models alive. Each model applies its own preprocessing. The shared decoded buffer/promise is local to one run and is not retained in session state.

Cancellation aborts orchestration, terminates the active worker, ignores late native-decode completions and prevents later stages from starting. Native decoding and already executing native kernels may take time to release resources. Unsupported audio/codecs, mismatched decoded duration, missing assets and runtime failures are explicit errors. A failure in one modality preserves successful outputs from other modalities; failed retries preserve previous successful output with an error notice. Individual failed vocal windows yield `partial` rather than a fully successful run. No-face observations and silent/too-short vocal windows are valid explicit unclassified observations.

## One media clock and compact tracks

`subscribeVideoClock` now multiplexes subscribers through **one native media-event/frame callback subscription per video element**. All three sources read the player's actual `currentTime`; seconds convert to milliseconds. Paused seeks, timeupdate, play/pause and ended events update tracks. Listener/frame resources are removed after the last subscriber leaves.

The vocal SVG track uses the same `0..session.durationMs` scale, range thumb alignment and time markers as the existing facial track. At most one SVG path per category/status plus one active outline is rendered, regardless of interval count. Only the current/inspected window's original model scores enter the DOM. The clock changes React state only at interval boundaries; playhead/range updates are imperative. Hover, touch and keyboard inspection, click-to-seek and a window-start button share the one player. Missing audio tails/gaps remain visibly unanalyzed; silent, too-short and failed windows are distinct from `neu`. No automatic scrolling, playback inference or facial/vocal agreement interpretation is performed.

## Session JSON v3

Existing envelope/session/facial/transcription fields keep their names. New exports set `schemaVersion: 3` and may include:

- `selectedAnalyses`: `{ facial, speech, vocal }`, the last explicitly requested nonempty combination. Successful outputs from previous runs can remain even when not selected in a retry.
- `vocal.status`: `not-requested`, `completed`, `partial`, `error`, or `cancelled`.
- `vocal.samples`: ordered non-overlapping `{ startMs, endMs, status, predictedLabel, scores, margin, error? }`. Unclassified samples have `predictedLabel: null`, `margin: null`, empty scores; failures never invent a category.
- `vocal.metadata`: exact model ID/revision, precision (q4 or fp32)/WASM, preprocessing identity, actual ordered labels, sample rate, window/step/overlap/RMS, decoded duration and load/inference timing. No raw PCM, video bytes, tensors or weights are exported.

Strict import validates model/config compatibility, finite bounded score values, the recorded model’s exact label mapping, score sum, winning label/margin, timestamps within the video and chronological non-overlap. Export uses whitelists. The existing 50-MiB/50,000-observation limits remain. v1/v2 imports preserve their original facial/transcription data with no invented vocal predictions; reexports use v3. Imported v3 restores saved results without inference, and reattaching the original video restores all tracks. Existing filename prefixes are retained for compatibility.

## Self-hosting

No new dependencies or model downloads were introduced. Assets remain under the existing revision-specific `/models/vocal-expression/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259/` URLs (89,879,304 bytes including notices). Transformers.js remote models remain disabled; model/WASM requests and CSP remain same-origin only with redirects rejected. Existing browser Cache API plus revision-specific immutable HTTP caching remain in use. Other static hosts must provide the cache rules documented by Phase 6A. Emotion2vec retains its versioned `/models/vocal-expression/emotion2vec-base/334d4376993c381f059cc36d2c6ed05cbfec5ca1/` assets (373,295,401 bytes including head/notices). Its unchanged same-origin fetch/cache adapter uses `interview-mirror-vocal-assets-v1`. There is no Service Worker/offline guarantee.

## Checks and manual protocol

Automated checks cover all seven analysis combinations, shared decode/order, cancellation, partial failures/retries, configured product loading for both preserved models, v3 round trips/invalid records, v1/v2 compatibility, recorded/uploaded sessions, native playback/paused/manual seeking, compact track rendering and the shared clock. Existing facial/STT and both Lab-model tests remain applicable.

Run from the root:

```sh
npm test
npm run build
npm run verify:web
npm run lint
```

Desktop/mobile manual testing:

1. Use HTTPS on the same LAN (Web dev port 5174). Start with a supported 10–20-second video containing audible speech. Keep facial-only as a baseline, then test vocal-only and all three. Verify only selected stages run, models load sequentially and the interface remains responsive. On a real phone, record browser/OS/device, initialization time, failures and memory behavior.
2. After processing, play normally across vocal boundaries, pause, scrub with the native video controls and seek forward/back through both tracks/transcript. Inspect all original model scores (nine for Emotion2vec, four for Wav2Vec2). Confirm silent/too-short/failed intervals have no invented prediction and late audio gaps have no active window.
3. Export v3, reload and import it without media. Verify saved results remain inspectable and no model loads. Reattach the exact original video; verify all available tracks highlight at matching media times. Import old v1 and v2 fixtures as well.
4. Record with camera/microphone, stop, choose vocal-only or a combined mode, and explicitly Analyze Recording. Recording itself must not start inference. Export and reconnect as above.
5. Cancel during native decoding, model loading and each inference stage; successful earlier outputs remain exportable and later stages never start. Test missing/corrupt assets, video without audio and unsupported codecs. Review explicit partial/error status instead of interpreting missing data as neutral.
6. In browser Network, confirm same-origin model/WASM requests, no audio uploads, no requests for the unselected vocal model, and cache reuse on repeated analyses.

### Desktop production smoke test (2026-11-04, original 5-second configuration)

A generated 12-second gray video with the existing public IEMOCAP happy demo plus silence completed all three stages: 60 no-face observations, completed Whisper output, and three vocal intervals (`hap` 0–5s, `neu` 5–10s, silence/unclassified 10–12s). Wav2Vec2 loaded in 2.154s and inferred in 10.483s. The session exported as v3 with all selections and original model scores. The second window includes the utterance tail: its neutral label is a model output, not a silence truth label. Whisper repeated text and could not provide valid segment timestamps on this mostly silent fixture; the existing explicit timestamp warning remained visible. The preserved Emotion2vec Lab adapter also loaded successfully from its browser cache in 3.55s after extraction. This is technical execution evidence, not an accuracy benchmark. The exported file was imported in a fresh tab without inference; reattaching the generated original video restored the saved tracks and all-three selection. The actual observed playhead reached the video end; paused seeking to 6s selected the 5–10s vocal interval and updated the facial track to 6s.

## Limitations

The existing native audio decoder supports at most five minutes / 250 MiB, subject to codec/browser memory. Decoded buffers may be allocated before the duration limit can be checked. Emotion2vec assets require about 373 MB (Wav2Vec2 about 90 MB) before runtime/tensor memory; desktop success does not establish physical mobile compatibility or multi-minute reliability. Mobile hardware testing remains manual.

The RMS gate is not VAD and may skip quiet speech or classify background noise. Both models require independent real-interview and Spanish evaluation; the provisional selection makes no validated accuracy claim. Softmax scores are not calibrated emotion probabilities. Whisper may hallucinate on silence; missing timestamps remain explicit instead of fabricated. No fusion, psychological assessment, ranking or final report is added.

### Reversible-switch production checks

With `ACTIVE_SER_MODEL = 'emotion2vec'`, the production application completed vocal-only inference on the existing 12-second synthetic video using four three-second windows and rendered the nine original categories/scores. An original Wav2Vec2 v3 export imported in a fresh production tab retained its four labels, numerical scores, model ID, q4 precision and five-second historical boundaries while Emotion2vec remained active. Wav2Vec2 also initialized through the shared Lab worker with its original 16-kHz / `do_normalize: false` settings and completed inference on the 5.130-second demo, preserving all four scores and explicitly skipping its 0.130-second tail. These checks establish technical operation, not comparative accuracy or a winner. Real interviews and physical mobile testing remain part of the user’s manual evaluation.
