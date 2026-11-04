# Phase 5A — browser speech-to-text spike

Open **https://localhost:5174/experiments/stt/** after `npm run dev:web` from the repository root (Node >=22.12). Use the computer's HTTPS LAN address on a phone connected to the same network, with the development CA installed/trusted. The production build also includes `experiments/stt/index.html`; static hosting must serve this directory's index rather than rewriting it to the product index.

This is an isolated multi-page experiment. It imports no facial analysis/session code, changes no session schema, stores no transcripts and requests no microphone. Both this page and the product now load model/config files exclusively from the application origin; remote model loading is disabled. Both pages keep audio local. No audio bytes are sent to the model host; the inference pipeline receives a transferred local Float32Array, never a remote audio URL. Inspect Network during a run to confirm this. Model/runtime cache entries can persist; clear site storage to measure a cold load. Do not confuse caching weights with uploading audio.

## Runtime and model

- Exact dependency: **@huggingface/transformers 4.3.2**, checked against the installed source/types and [official release](https://github.com/huggingface/transformers.js/releases/tag/4.3.2).
- Multilingual **[onnx-community/whisper-tiny](https://huggingface.co/onnx-community/whisper-tiny)**, pinned revision `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`, `dtype: 'q8'` on both encoder and merged decoder. This requests `encoder_model_quantized.onnx` (~10 MB) and `decoder_model_merged_quantized.onnx` (~31 MB), plus configuration/tokenizer files. All seven files are self-hosted under a revision-specific static path; [asset paths, sizes, reproducible download and caching](../../../WHISPER_ASSETS.md).
- Backend choices: **WASM/CPU** (default compatibility path), **WebGPU** (experimental, offered only after an adapter probe; probed again inside the Worker). Adapter availability does not prove support for every quantized ONNX operator. Loading/inference failures are shown; explicitly abandon and load WASM if needed. No automatic second model or variant is downloaded. The same q8 configuration makes backend experiments comparable.
- One dedicated module Worker, one model, one operation at a time. Inference never runs on the UI thread. WASM uses one thread and no proxy; no SharedArrayBuffer/cross-origin isolation requirement is introduced by the app.
- Version-matched ONNX runtime `.mjs`/`.wasm` files are served locally by `stt-assets.mjs`, not a script CDN. The installed Transformers.js default asyncify runtime is used, with its plain-runtime fallback for Safari below 26 when no WebGPU API exists. The Vite external-WASM export condition avoids bundling a duplicate runtime binary. Two runtime builds are packaged for browser compatibility; only the selected runtime is fetched on initialization. These are not additional model variants.
- Loading is explicit. Loading time includes model download/cache retrieval and initialization; progress is per file when reported by Transformers.js, not a fabricated global percentage.

## Audio and timestamps

`audio.ts` decodes file bytes through native `AudioContext.decodeAudioData`, inspects the **actual decoded rate**, averages all channels, and uses `OfflineAudioContext` to resample when necessary. The source buffer retains the actual source rate; the rendered rate and length must match 16 kHz and the expected duration. Already-16-kHz mono PCM avoids a second resample. Decoding can itself resample to the hardware context rate, which is accounted for by inspecting the result. Contexts close/disconnect in finally blocks. Input PCM is transferred to the Worker without keeping a second main-thread PCM copy.

There is no FFmpeg dependency. Browser codec support applies to both audio and video containers; unsupported/no-audio files get a decode error. Limits are 250 MiB encoded file and five minutes decoded audio. Native decoding allocates its buffers before the duration limit can be checked, so a highly compressed long file can still exceed memory. Begin with 15–60 seconds and use 2–3 minutes for the long-recording experiment.

Pipeline options: `task: 'transcribe'`, explicit `english`/`spanish`, or omitted language for experimental Auto, `return_timestamps: true`, 30-second windows and 5-second left/right strides. The installed pipeline processes windows sequentially and its tokenizer `_decode_asr` merges overlap and applies offsets. We do **not** manually concatenate overlapping window texts or apply their offsets again. Auto's detected language is not exposed by this pipeline result; `language: null` means unreported, not a verified detection.

`normalizeTranscript` converts segment seconds to integer milliseconds relative to the original media. It accepts an explicit offset for independently processed future chunks (covered by tests), but the built-in chunked pipeline already returns the original time origin, so the current call passes zero. Segments must have finite numeric bounds, positive duration, chronological order, no overlap, and fit the original duration. Missing/null/invalid timestamps discard the synchronized segment list **without discarding the full text**, with a visible warning. No synthetic ends, clipping to duration or guessed word timings. Repeated speech is not blindly deduplicated. Model-generated timing still needs human validation.

Click a segment to seek. Highlight follows the native media clock via animation frames, independent of inference, with no integration into the facial expression timeline.

## Measurements and cancellation

The page reports model load time separately; file read/native decoding, mono/resampling, inference, processing wall time (excluding model load), source audio duration, actual result backend/model, segment count and approximate 16-kHz PCM input bytes. **RTF = inference milliseconds / audio duration milliseconds**. RTF <1 is faster than real time. PCM bytes exclude source buffers, tensors, runtime and GPU allocations; no exact browser-memory claim is made. Repeat warm runs separately from cold loads.

An idle model can be unloaded with pipeline `dispose()` followed by Worker termination. **Abandon** terminates the Worker and invalidates its generation, rejecting pending requests and preventing stale decoding/inference results from replacing a newer experiment. Native audio decode/render and GPU/ONNX kernels are not guaranteed to stop immediately; the browser may reclaim resources later. Transformers.js has an `InterruptableStoppingCriteria` token-generation API, but a busy WASM Worker cannot reliably process a cancel message during a native kernel, and this API is not an immediate kernel-abort mechanism. This spike uses Worker abandonment instead of promising immediate inference interruption. Changing backends requires explicit unload/abandon and a new model load.

Media object URLs are revoked on file replacement and unmount. Playback/source file remains available after abandonment for retry; no persistent audio/transcript storage is created. Reloading loses results. Errors cover capability checks, adapter failure, file/codec decoding, invalid output/timing, downloads/backend failures and recognizable memory allocation errors. Browser termination of the entire tab cannot always produce a recoverable error.

## Automated checks

From the root:

```sh
npm test
npm run typecheck
npm run lint
npm run build:web
npm run verify:web
```

Focused tests cover mono/stereo/multichannel conversion, invalid samples, verified native resampling/no-op rate, timestamp units/offsets/missing bounds/overlap/range/repeated text, RTF, unsupported capabilities and adapter rejection, actionable errors, single-operation Worker protocol, transferred PCM, Worker failures/abandonment, explicit loading, stale decoded results and object URL cleanup. Audio rendering/Worker/GPU are mocked: these checks do **not** establish actual transcription quality, native codec compatibility or mobile performance.

## Manual experiment protocol — not yet measured

Use the same files and q8 configuration across backends. Record browser/version, OS, device/CPU/GPU, date, model revision/files, language choice, cold/warm cache, backend, load/decode/preprocess/inference/total times, RTF, segment count, approximate PCM bytes, errors and subjective text/timing quality. Use browser Network to verify weights/config downloads but **no audio upload**. Confirm only one Worker/model is active. Test abandon during download/decode/inference and confirm late results do not appear; reload before measuring another run.

| Experiment           | Input and procedure                                                                               | Acceptance observations                                                                                                                                     | Status  |
| -------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A — English          | 30 s clear English; English selected                                                              | Compare full text against reference; check segment start/end by replay and seek; record load/inference separately                                           | Not run |
| B — Spanish          | 30 s clear Spanish; Spanish selected; optionally compare Auto                                     | Output remains Spanish, not translated; check accents/text/timing and same metrics                                                                          | Not run |
| C — Longer recording | 2–3 min interview with speech around 20/30/40/60 s boundaries                                     | No doubled/missing boundary text; chronological non-overlapping segments; seeks align throughout; responsive controls; record memory failures               | Not run |
| D — Backends         | Same file, language, q8 model and device; unload between WASM/WebGPU; repeat cold/warm separately | Report actual success/failure and timing; do not attribute cache-load differences to inference speed; do not replace a failed q8 run with a different dtype | Not run |
| E — Physical mobile  | Real iPhone/browser and/or Android/browser; record exact model/OS/browser                         | Record available backend, load behavior, duration/RTF, backgrounding behavior, errors/crashes and playback/seek; desktop emulation is insufficient          | Not run |

Also test unsupported/empty/corrupt/no-audio media, denied model network access, missing adapters, repeated load/unload and file replacement. Validate both dev and built preview entry points. Browser autoplay policy may require pressing native Play; seeking does not force playback.

The later self-hosting change passed desktop production smoke tests with synthetic English/Spanish audio and valid segments; see [verification details](../../../WHISPER_ASSETS.md). This was not a broad accuracy/GPU/mobile benchmark. The user subsequently reported successful Phase 5A desktop runs: Spanish 17.32 s / inference 3.97 s / RTF .229 and English 60.05 s / inference 18.84 s / RTF .314, with manually validated text/timing. These supplied results do not establish physical-mobile performance. Useful quality, practical speed, timestamp accuracy, mobile feasibility and WebGPU improvement remain **open experimental questions**. Desktop success alone would not establish production readiness. There is no Phase 5B, session/report integration, diarization, translation or voice emotion analysis here.

## Phase 5B reuse

The audio, normalization, client/protocol and Worker modules now live under `features/speech/lib`. This experiment keeps compatibility forwarding modules and the same interface/model options; the main product uses the same inference implementation through a UI-independent service. See [integrated session workflow](../../features/speech/README.md).
