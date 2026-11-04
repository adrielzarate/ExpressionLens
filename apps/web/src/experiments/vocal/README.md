# Phase 6A — Vocal Expression Lab

Open **https://localhost:5174/experiments/vocal/** after `npm run dev:web`. This is a separate HTML entry, consistent with the isolated STT spike. The experiment stays separate from the product workflow. Phase 6B now integrates the same Wav2Vec2 loader/core in the product; Emotion2vec remains experiment-only. See [Phase 6B integration](../../features/vocal/README.md). Uploaded/recorded-video acquisition, facial analysis, Whisper inference, session JSON v2 and reports have not been changed.

## Model selector

Choose **Wav2Vec2 SUPERB ER** (default) or **Emotion2vec+ Base**, then explicitly click **Load SER model**. Changing selection disposes the previous idle model and terminates its Worker; it does not load the next model automatically. Media/settings and the last 12 runs stay available. Current timeline and expected category reset; each retained run keeps its own model ID/revision/precision and label order. Load failures can be abandoned and retried with the smaller model.

Emotion2vec+ uses the published [pankotaro ONNX export](https://huggingface.co/pankotaro/emotion2vec-plus-base-onnx) of [emotion2vec/emotion2vec_plus_base](https://huggingface.co/emotion2vec/emotion2vec_plus_base), pinned revision `334d4376993c381f059cc36d2c6ed05cbfec5ca1`. This is a community export, not an official Transformers.js audio-classification pipeline. The app feeds raw 16-kHz mono PCM `[1,N]` to its **FP32** encoder; waveform normalization is embedded in that graph. It mean-pools `[1,T,768]` frame features, applies the bundled nine-class linear head (`W × mean + bias`), and applies stable softmax once. JavaScript does not normalize the waveform a second time. Head shapes/values and output dimensions are validated, and input/output tensors and sessions are disposed.

Actual labels from the published head: **angry, disgusted, fearful, happy, neutral, other, sad, surprised, unknown**. They are kept intact, without mapping to the facial classifier or Wav2Vec2 category set. `unknown` is a trained category, not an added confidence threshold. Score values across different heads are not calibrated for direct comparison. More classes or an agreeing demo result do not establish higher accuracy.

### Emotion2vec assets

All four files are retained under `apps/web/public/models/vocal-expression/emotion2vec-base/334d4376993c381f059cc36d2c6ed05cbfec5ca1/`, copied unchanged to the same production URL path:

| File                         |                        Bytes |
| ---------------------------- | ---------------------------: |
| `emotion2vec_plus_base.onnx` |                  373,159,295 |
| `emotion2vec_head.json`      |                      128,472 |
| `LICENSE`                    |                        5,306 |
| `README.md`                  |                        2,328 |
| **Total**                    | **373,295,401 (356.00 MiB)** |

The graph SHA-256 is `a9ddcc2f4254c3da1dc2a51ea5e38df32e2a84724519e343499f05f0ea2b3506`; `emotion2vec-assets.json` pins all sizes/hashes. Run `npm run assets:emotion2vec` to reproducibly restore/verify files at development time. Both manifests are checked by the Vite plugin before dev/build/preview and by `npm run verify:web` against production output. Assets retain their **FunASR Model License**, upstream card and attribution; this license differs from Wav2Vec2’s Apache 2.0.

Runtime asset fetching is same-origin only with redirects rejected. Emotion2vec uses `interview-mirror-vocal-assets-v1` Cache API where available and falls back to normal HTTP caching on quota/unavailability. Dev/preview provide revision-specific `public, max-age=31536000, immutable` headers; static deployments must supply the same rule. No Service Worker or offline guarantee. Selecting a model does not fetch its weights; explicit load does. ONNX Runtime Web is declared as a direct dependency at the **same version already used by Transformers.js**, without upgrading the shared runtime.

FP32 download is much larger than Wav2Vec2 q4 and peak memory exceeds download size. Only one model is retained. Physical mobile feasibility and independent Spanish/natural-interview accuracy remain unvalidated.

### Selector production smoke test — 2026-11-04

On this desktop, Emotion2vec loaded in **8.39 s**, analyzed the existing 5.130-s public happy demo in **5.385 s** (RTF **1.050**), and returned `happy` ~100%, all nine scores, no failed/skipped windows. Changing to Wav2Vec2 unloaded it while preserving its nine-class history. After the switch, Wav2Vec2 loaded in **4.03 s**, processed the same clip in **5.355 s** (RTF **1.044**), and returned `hap` **99.07%**. Both runs remained inspectable with their original four/nine label mappings. This is a technical smoke test on one supplied demo, not a recognition-accuracy benchmark. Pure head/softmax, adapter same-origin loading/resource disposal, Worker selection/laziness and UI switching/history have automated regression tests.

## Original Wav2Vec2 decision and evidence

Selected **[onnx-community/wav2vec2-base-superb-er-ONNX](https://huggingface.co/onnx-community/wav2vec2-base-superb-er-ONNX)**, revision **`e2191e9e8b692c19c7d96e2a1d789ab1df5b7259`**, `dtype: q4`, **WASM/CPU**. This is an existing ONNX export of [superb/wav2vec2-base-superb-er](https://huggingface.co/superb/wav2vec2-base-superb-er), not a new model trained for ExpressionLens.

Evidence was checked in the actual downloaded config/processor/graph, the upstream model cards and installed Transformers.js **4.3.2** source:

- `architectures: [Wav2Vec2ForSequenceClassification]`, supported by the installed AutoModelForAudioClassification path. The audio-classification pipeline invokes the model, reads logits, applies softmax **once**, then returns label/score pairs. The app preserves those scores.
- Actual `id2label`: **0 = neu, 1 = hap, 2 = ang, 3 = sad** (neutral, happy, angry, sad). Labels/order are read from `model.model.config`, not substituted with facial-expression classes. These four Wav2Vec2 labels remain unchanged; Emotion2vec has its own nine-label mapping.
- Actual `preprocessor_config.json`: **16000 Hz**, `Wav2Vec2FeatureExtractor`, **`do_normalize: false`**, `return_attention_mask: true`, raw mono waveform. The installed extractor respects `do_normalize` and constructs the input tensor/mask. We do not add variance normalization, Whisper log-mel features or a second softmax.
- q4 is the existing upstream `onnx/model_q4.onnx`; this repository also lists the identical blob as `model_bnb4.onnx`. It is not a nonexistent q8 export or an assumed generic int8 model. Loading **and actual inference** with the existing ONNX Runtime Web WASM build were verified in the desktop browser.
- Upstream cards declare **Apache-2.0**. Retain the bundled Apache license, upstream model card, model names and attribution/notices when redistributing. The model graph is unchanged here; ONNX conversion/quantization was performed upstream. No training audio is bundled.

### Alternatives considered

| Candidate                                                                                                                             | Evidence / compatibility                                                                                                     | Reason not selected for this spike                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original SUPERB Wav2Vec2-base ER                                                                                                      | Apache-2.0; English IEMOCAP; same four categorical classes; PyTorch original                                                 | The community ONNX export avoids adding a conversion toolchain. Its float32 graph is 378,495,202 bytes versus 89,861,131 bytes for the chosen q4 graph. Quantization parity still needs separate evaluation.           |
| [audEERING Wav2Vec2-large-robust-12-ft-emotion-msp-dim](https://huggingface.co/audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim) | Official card: roughly 0.2B parameters, English MSP-Podcast, available ONNX export, custom regression head, CC-BY-NC-SA-4.0  | Outputs arousal/dominance/valence, rather than the required categorical inspection; different output semantics and redistribution conditions. Not a drop-in categorical audio-classification model.                    |
| [emotion2vec+ base ONNX](https://huggingface.co/pankotaro/emotion2vec-plus-base-onnx)                                                 | Card describes raw 16-kHz input, per-frame 768-D embeddings, a separate JSON nine-class linear head and FunASR model license | Originally deferred; now implemented as a separate WASM adapter with the published pooling/head recipe. See selector section above.                                                                                    |
| [Wav2Small](https://arxiv.org/abs/2408.13920)                                                                                         | Paper describes 72K-parameter distillation for dimensional speech expression recognition                                     | Interesting smaller alternative for mobile; not the ready-to-run four-class Transformers.js pipeline validated here. Pretrained artifact, license, preprocessing and browser conversion need a separate investigation. |

The originally considered `Xenova/wav2vec2-base-superb-er` repository was not publicly available during inspection; no weights or compatibility claims rely on that identifier.

## Training domain and score meaning

The upstream SUPERB model uses IEMOCAP English emotional speech, including actor/scripted/improvised recordings, with a four-class protocol and session-based evaluation. The card describes five-fold standard splits. This is not representative validation on natural interviews, Spanish, arbitrary accents or every speaker population. The original published model score is **not** an accuracy measurement of this browser prototype, its q4 export or fixed windows.

The input is the waveform, not an STT transcript or sentiment analysis. A pretrained speech encoder can nevertheless encode phonetic/linguistic cues; this experiment does not prove that decisions depend exclusively on prosody. Outputs are **softmax model scores**, not calibrated probabilities of a person's actual emotional state, psychological traits or interview suitability. A high score on out-of-domain audio can be meaningless.

No universal confidence threshold is introduced. The top-two margin is shown as an inspection statistic; ambiguous results remain inspectable instead of silently relabeling them. Selecting a language in evaluation notes does not adapt or translate the model.

## Architecture and processing

New modules live under `apps/web/src/experiments/vocal/`:

- `Lab.tsx`, `main.tsx`, `vocal.css`: explicit model load/unload, local audio/video preview, configuration, progress/errors, performance, in-memory comparison notes/history for the last 12 runs and per-window score inspection. No persistent storage or session export integration.
- `core.ts`: validated non-overlapping segmentation, AC RMS, score mapping/margin, unclassified cases and sequential window execution. `protocol.ts`, `client.ts`, `vocal.worker.ts`: one Worker, model and operation; transferred PCM; local-only model/runtime loading; config-driven label/preprocessing inspection; errors/disposal.
- `Timeline.tsx`: time intervals, all category scores, active interval, click-to-seek and failed/skipped states. It reuses the validated `subscribeVideoClock` native media-event/frame-callback mechanism. Audio uses its existing animation-frame fallback. Playback/seek/pause never runs inference and no autoscroll is introduced.
- `../../features/vocal/assets.json`: shared pinned Wav2Vec2 paths, sizes/SHA-256 and upstream JSON Git blob hashes. Public model asset paths are unchanged.
- `experiments/vocal/index.html`: isolated entry with same-origin CSP. `apps/web/vocal-assets.mjs` serves only the pinned static whitelist in dev/preview. Vite adds this entry alongside the existing product/STT entries; no Lab modules are imported into the product.
- `scripts/vocal-assets.mjs`: reproducible development-time download/verification; production boundary verification additionally checks copied hashes/CSP. Existing STT's runtime-assets plugin supplies the same local ONNX WASM files.

Audio decoding reuses **only** `features/speech/lib/audio.ts`: native `decodeAudioData`, actual decoded rate verification, channel averaging and verified OfflineAudioContext resampling to 16 kHz. The separate SER pipeline then applies its own feature extractor/config. Native contexts and nodes are closed/disconnected, transferred input is not copied into history, object URLs are revoked on replacement/unmount. The preview retains its source file until replaced or the page closes.

Windows are configurable **3, 5 or 10 seconds**, non-overlapping, with sample-index-derived media-relative milliseconds and an actual truncated final interval. There is no overlapping concatenation or timestamp inference. Windows shorter than **0.5 s** are unclassified (`too-short`); this is an experimental minimum-context choice, not a validated emotion boundary. The final interval can be short and still classified if it meets this minimum.

The configurable **AC RMS gate** (default `.0001`) checks waveform variation before model inference. Exact silence and constant DC are skipped; zero disables only the positive amplitude cutoff, so exact zero-variation signals still skip. This is an amplitude heuristic, **not VAD**, speech detection or background-noise rejection. A quiet speaker can be skipped; noise above the gate can receive a high emotional-category score. There is no invented `noise` emotion class.

Each result retains start/end, predicted label or null, all valid scores, margin and status (`classified`, `silent`, `too-short`, `failed`), plus an error when applicable. Per-window failures produce no fabricated label and can allow later windows to complete. Recognizable runtime/memory failures abort the run with an actionable error. All classes are requested (`top_k = number of actual labels`).

## Self-hosted assets and caching

Source: `apps/web/public/models/vocal-expression/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259/`.

| File                                          |                      Bytes |
| --------------------------------------------- | -------------------------: |
| `onnx/model_q4.onnx`                          |                 89,861,131 |
| `config.json`                                 |                      2,494 |
| `preprocessor_config.json`                    |                        215 |
| `README.md` (upstream model card/attribution) |                      4,106 |
| `LICENSE.txt` (Apache 2.0 text)               |                     11,358 |
| **Total**                                     | **89,879,304 (85.72 MiB)** |

Only the graph/config/preprocessor are needed by inference. The total includes bundled license/card, but excludes existing shared ONNX WASM/runtime files and decoded/tensor memory. Browser peak RAM is substantially larger than the model file size and is not measured here.

```sh
npm run assets:vocal          # restore missing/corrupt pinned files at development time
npm run assets:vocal:verify   # local checks only
npm run build:web
npm run verify:web
```

Every file is verified before use/build; matching assets are reused without network. The license text is copied reproducibly from the installed Transformers.js Apache license and checked against its pinned SHA-256; the model's license declaration comes from its upstream card, not from this source of generic license text. Formatting excludes these raw upstream files. Vite copies `public/` into `dist/` unchanged.

The Worker enables local models and browser cache, disables remote models, requests `local_files_only: true`, rejects cross-origin fetch/redirects and selects same-origin WASM paths. Model loading is explicit. The page's CSP permits only same-origin connections. Runtime users never access Hugging Face, and no raw audio is uploaded. UI provenance links are not used as runtime asset URLs.

Cache API is used where available. Dev/preview serve revision-specific files with `Cache-Control: public, max-age=31536000, immutable`; other static deployments must replicate that cache rule. Model changes require a new revision path. Cache availability/eviction/quota remains browser-controlled; there is no new Service Worker or full offline guarantee.

## Timing, cancellation and limits

Model loading is measured separately. Each run shows native decoding, mono/resampling, window suitability checks, inference (including the model's own feature extraction), wall processing time excluding model load, original audio duration, all/valid/failed/skipped counts, model size/backend/ID and **RTF = total model inference time / full audio duration**. Gates/skips consume no model inference time, so RTF on a mostly silent clip is not a speech-inference benchmark.

The UI stays outside the inference Worker. Abandon terminates it, invalidates the generation and rejects pending requests; late decode/inference callbacks cannot replace a newer result. Native audio decoding or an in-flight ONNX kernel may finish before the browser reclaims resources. Idle unload calls pipeline dispose and terminates the Worker. Native decode can keep resources alive until its promise settles. Multiple model instances are not intentionally retained.

The reused decoder's limits are **250 MiB / five minutes**; it allocates decoded buffers before duration can be checked. Begin with 5–15 seconds. Ten-second windows can have substantially larger memory/latency than three-second ones. One WASM thread is the reference; WebGPU is not enabled or claimed compatible for this q4 graph. Physical mobile feasibility remains open.

## Evaluation observations — 2026-11-04

Desktop in-app browser, local HTTPS, existing Transformers.js 4.3.2 / version-matched ONNX Web, one WASM thread. These are technical/apparent-quality smoke tests, not labeled recognition-accuracy validation. Synthetic voices provide reproducible technical inputs, not human-emotion ground truth. Source clips were read locally after development-time downloads; they are not fetched by the app and are not bundled.

| Input                                             | Configuration                           | Observation                                                                                                                                                     | Inference / audio / RTF                               |
| ------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Synthetic English conversational speech           | 5 s windows, 2 valid windows            | `neu` in both; no ground-truth emotion label                                                                                                                    | 6.857 s / 7.308 s / .938 (dev)                        |
| Public model-card IEMOCAP happy example           | 10 s window covering 5.130 s utterance  | `hap` 99.03%; agrees with supplied demo label                                                                                                                   | 4.760 s / 5.130 s / .928 (production)                 |
| Public model-card IEMOCAP neutral example         | 10 s window covering ~4.394 s utterance | `hap` 52.87%, `neu` 46.47%; disagrees with supplied neutral label, margin ~6.41 points                                                                          | 3.883 s / 4.394 s / .884 (production)                 |
| Synthetic Spanish conversational speech           | 10 s window, 1 valid window             | `hap` 55.83%; only technical execution verified, no emotion ground truth                                                                                        | 5.309 s / 6.438 s / .825 (production)                 |
| 6 s exact silence + 6 s deterministic white noise | 3 s windows, 4 intervals                | Both silent windows unclassified. Noise windows incorrectly suggest meaningful `hap` scores (99.62% and 77.02%): a concrete limitation without VAD/OOD handling | 5.302 s / 12 s / .442 (production, 2 windows skipped) |

Cold production model initialization: **2.78 s** in this run. These short clips do not establish sustained multi-minute speed, memory safety, validated Spanish accuracy or mobile viability. Do not report a 2-example accuracy percentage. The model-card examples may overlap upstream evaluation/training material and are not an independent benchmark.

Public demo sources, supplied by the original model card:

- Happy: https://cdn-media.huggingface.co/speech_samples/IEMOCAP_Ses01F_impro03_F013.wav
- Neutral: https://cdn-media.huggingface.co/speech_samples/IEMOCAP_Ses01F_impro04_F000.wav

**Decision:** technically feasible on this desktop; useful for inspecting an experimental baseline. The neutral/happy confusion and high-score noise false positives mean it is **not ready for unattended natural-interview interpretation**. Before considering any production integration, investigate speech/non-speech handling and independent, speaker-separated, multilingual evaluation. No such integration/VAD model is implemented in Phase 6A.

## Manual protocol and remaining evaluation

1. Open the isolated route, explicitly load the SER model, inspect the actual labels/config and select 3/5/10 s windows. Choose a local audio/video. Annotate speaker/language/input condition/expected category **before** running, without treating a model guess as the expected label.
2. Run, inspect every score/margin and skipped/failed interval; expand retained-run score tables to compare clips. Click intervals, play, seek forward/back, pause and enter silent windows. Check active highlight follows the media's actual time without inference or autoscroll.
3. Repeat with 3/5/10 s windows, cache-cold/warm loads and different clip lengths. Keep load, inference and total timing separate. Record failures and the fraction of skipped windows rather than discarding difficult clips.
4. Verify model/WASM requests in Network are same-origin and no audio is uploaded. Test corrupt/no-audio/unsupported-codec input, tiny tails, empty files, missing model assets, explicit unload/reload, file replacement and abandonment during load/decode/inference.

| Test set                            | Required observations                                                   | Current status                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Neutral natural English             | Multiple speakers, reference labels, window/context effects             | Synthetic execution and one supplied neutral-demo confusion observed; independent human set pending                      |
| Happy/excited English               | Natural and acted speech, multiple speakers                             | One supplied happy-demo agreement; broader evaluation pending                                                            |
| Angry/frustrated                    | Actual supported `ang` class, varied volume and speakers                | Labeled real-speech evaluation pending                                                                                   |
| Sad/subdued                         | Actual supported `sad`, varied pitch/quiet speech                       | Labeled real-speech evaluation pending                                                                                   |
| Different speakers                  | Speaker-separated train/eval provenance, multiple ages/accents          | Synthetic English/Spanish voices plus one IEMOCAP actor tested technically; independent multi-speaker evaluation pending |
| Spanish in all supported categories | Independent native-speaker labels; language-domain shift                | Synthetic technical execution only; quality validation pending                                                           |
| Silence / DC / short tails          | Null predictions, skip counts and precise bounds                        | Silence tested in production; DC/tail covered automatically                                                              |
| Background noise / non-speech       | False positives and high scores, no assumption of emotional speech      | White-noise false positives observed in production; real noise and mixtures pending                                      |
| Audio-containing video              | Same decoding, timestamp origin and playback                            | Native shared-decoder path retained; representative codec/track-offset manual checks pending                             |
| Physical mobile / long recordings   | Actual OS/browser/device, RAM failures, load/inference/RTF, UI response | Pending; desktop results do not establish compatibility                                                                  |

For validated accuracy, acquire appropriately licensed independently labeled samples, retain speaker/clip provenance, keep same-speaker content out of independent evaluation groups, and report per-class metrics with uncertainty/coverage and sample counts. Separate acoustic-window labels from whole-utterance labels. Cross-language/natural-interview generalization must be measured, not inferred from synthetic clips. No psychological assessment, hiring/interview score, transcript sentiment, diarization, live microphone inference or facial/vocal fusion is included.

## Automated checks

Focused tests cover audio channel conversion/native decoding/rate/time origin/missing track cleanup (plus the shared STT resampling tests), segmentation at 3/5/10 s and actual tails, invalid PCM, AC silence/DC handling, all-label score mapping/probability preservation, malformed model outputs, null predictions on failures/skips, per-window continuation versus resource failure, cancellation/stale results, Worker protocol/explicit load/local-only runtime/config flags, playback/seek/pause/end and UI object-URL cleanup.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run verify:web`. Model checksum and existing frozen facial/Whisper assets continue to be verified. Automated tests use mocked Workers/models/native decoding and do not require a microphone or GPU; actual SER graph execution was verified separately in the browser as recorded above.
