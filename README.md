# ExpressionLens

**AI-powered expression analysis**

ExpressionLens is an AI Engineering course project exploring browser-local analysis of **visible facial expressions**, not a person's actual emotions. The project now has two independent React + TypeScript + Vite applications in one Git repository, managed with **npm workspaces**. There is no backend or server-side inference.

| Workspace                                            | Purpose                                                                                                                                               | Entry point                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `apps/lab` · `@expressionlens/lab`                   | Existing AI development tools: Facial Expression Lab, Dataset Collector, Training, Blendshape Inspector                                               | `apps/lab/src/main.tsx`            |
| `apps/web` · `@expressionlens/web`                   | Local upload/recording, offline expression analysis, synchronized timeline and portable session JSON                                                  | `apps/web/src/main.tsx`            |
| `packages/classifier` · `@expressionlens/classifier` | Shared inference contract, MediaPipe initialization, canonical blendshape extraction, neural model loading/prediction, and uncertainty interpretation | `packages/classifier/src/index.ts` |

The Web application does not import Lab components or training code. It loads the shared inference runtime only when video analysis starts. This is architectural separation, not hidden Lab navigation.

## Naming and backward compatibility

The product is **ExpressionLens**, and the internal development tools are **ExpressionLens Lab**. The project was previously named **Interview Mirror**. npm workspaces now use `@expressionlens/web`, `@expressionlens/lab`, and `@expressionlens/classifier`; source imports, build configuration, scripts and the lockfile use that scope consistently.

The repository root directory remains `interview-mirror/`; no directory rename is required. It may be renamed manually to `expressionlens/` after stopping development servers and updating local workspace paths.

For compatibility, the following historical identifiers deliberately remain unchanged:

- `interview-mirror-facial-dataset` IndexedDB database and `interview-mirror-vocal-assets-v1` browser cache: existing datasets and cached model assets remain accessible.
- Serialized `type` values `interview-mirror-facial-expression-classifier`, `interview-mirror-blendshape-inspector`, and `interview-mirror-manual-expression-evaluation`, their validators, types and fixtures: previously exported model metadata/snapshots remain valid.
- Existing session/dataset/inspector/evaluation export filenames and recording filenames, including their `interview-mirror-` prefixes: import/export and recording metadata behavior stays the same.
- Original reference datasets, snapshots, filenames, frozen model metadata/checksums, model identifiers and asset paths: historical artifacts are preserved byte for byte. The `mirror.svg` favicon depicts a mirror and keeps its existing asset URL.

The rebranding itself changed no schema versions, JSON fields, enum values, storage keys or inference settings and required no data migration. Later phases may explicitly extend the session schema, as documented below. After pulling this naming change, run `npm install` to refresh workspace links, then use the same `npm run dev:web` / `npm run dev:lab` commands.

## Structure

```text
interview-mirror/
├── apps/
│   ├── lab/                 # Original application, styles, tests and detailed Lab README
│   └── web/                 # Minimal, independently built product
├── packages/
│   └── classifier/
│       ├── src/             # Inference-only TypeScript; no collection/training UI
│       ├── models/
│       │   ├── face_landmarker.task
│       │   ├── face_landmarker.sha256
│       │   └── v3/          # Unmodified model.json, weights.bin, full metadata + checksums
│       ├── .generated/wasm/ # Ignored SDK assets, generated on npm install
│       └── vite.mjs         # Shared asset serving/emission for both Vite apps
├── references/              # Preserved synthetic images, datasets, experiments and model history
├── scripts/                 # Shared asset verification, HTTPS setup and build inspection
├── .certs/                  # Ignored local HTTPS credentials
├── package.json             # Workspace commands and shared development dependencies
└── package-lock.json        # Single dependency lockfile
```

ExpressionLens has its own Git repository in this directory, on `main`, independent of the parent course checkout. Its remote is [adrielzarate/ExpressionLens](https://github.com/adrielzarate/ExpressionLens).

## Install and run

Use Node **24** (`nvm use`, following `.nvmrc`), or a supported Node version matching `package.json`. Run commands from this directory:

```bash
npm ci
npm run assets:setup

# First-time local HTTPS setup (requires mkcert; existing root .certs are reused):
npm run https:setup -- <your-LAN-IP>

npm run dev:lab
# Separate terminal:
npm run dev:web
```

- Lab: [https://localhost:5173/](https://localhost:5173/)
- Web: [https://localhost:5174/](https://localhost:5174/)

Both servers bind to the local network. To test on a phone, trust the public mkcert root certificate on that device, use the computer's current LAN IP, and use port 5173 or 5174. Do not share the private TLS key. Both apps use the existing root `.certs/`; setup does not need to be repeated for each workspace. If an old pre-migration Vite process is running, stop it and restart with the new commands.

`npm ci` links the workspaces and copies the version-matched MediaPipe WASM into the ignored shared generated directory. Pretrained models are **not included in Git** and do not require Git LFS. Run `npm run assets:setup` before development/build to download their exact pinned files and verify their hashes. Valid existing local files are reused. Only the small project-trained facial classifier v3 remains versioned because it has no public download. Do not create per-application lockfiles or install separate copies of the models.

## Download and place pretrained models

The `.gitignore` excludes `apps/web/public/models/` (including ONNX weights, tokenizer, configuration, classification head and notices) and `packages/classifier/models/face_landmarker.task`. Ignoring these files does not delete local copies or exclude them from a production build. Source manifests, pinned revisions/checksums, download scripts and the project-trained classifier v3 stay in Git. No Git LFS installation is needed.

The recommended setup, from the project root with Node 24, is:

```bash
npm ci
npm run assets:setup
npm run assets:verify
npm run build
```

`assets:setup` runs these existing downloaders sequentially:

| Model                         | Setup command                | Destination directory                                                                                |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| MediaPipe Face Landmarker v1  | `npm run assets:model`       | `packages/classifier/models/`                                                                        |
| Whisper Tiny multilingual q8  | `npm run assets:whisper`     | `apps/web/public/models/whisper-tiny-q8/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/`                   |
| Wav2Vec2 SUPERB ER q4         | `npm run assets:vocal`       | `apps/web/public/models/vocal-expression/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259/`                  |
| Emotion2vec+ Base FP32 + head | `npm run assets:emotion2vec` | `apps/web/public/models/vocal-expression/emotion2vec-base/334d4376993c381f059cc36d2c6ed05cbfec5ca1/` |

Internet access to Google/Hugging Face is required **only during this setup when files are missing or invalid**. A correctly prepared checkout/build still serves all AI assets from the application's own origin. Remote model loading stays disabled in the browser; this change does not add runtime downloads or alter inference, model choice or caching. Both SER models are downloaded so the Lab and reversible product configuration remain usable. Existing size/SHA-256 checks reject HTML pages, Git LFS pointer files, wrong revisions and corrupted downloads.

For manual installation, download the exact files below and preserve the relative filenames/subdirectories inside the stated destination. Do not substitute a different precision, model revision or ONNX export. The source manifests linked below contain the expected hashes and byte counts.

### MediaPipe Face Landmarker

Download [face_landmarker.task — official Google v1 float16 bundle](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) to:

```text
packages/classifier/models/face_landmarker.task
```

Expected SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. The small [checksum file](packages/classifier/models/face_landmarker.sha256) remains in Git. `npm run assets:model` verifies this checksum; the binary is roughly 3.8 MB.

### Whisper Tiny multilingual q8

Source: [onnx-community/whisper-tiny — pinned revision `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`](https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7). [Pinned manifest](apps/web/src/features/speech/whisper-assets.json).

Destination:

```text
apps/web/public/models/whisper-tiny-q8/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/
```

| Required relative path                     | Download/source                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.json`                              | [Download](https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/config.json)                              |
| `generation_config.json`                   | [Download](https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/generation_config.json)                   |
| `preprocessor_config.json`                 | [Download](https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/preprocessor_config.json)                 |
| `tokenizer.json`                           | [Download](https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/tokenizer.json)                           |
| `tokenizer_config.json`                    | [Download](https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/tokenizer_config.json)                    |
| `onnx/encoder_model_quantized.onnx`        | [Download](https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/onnx/encoder_model_quantized.onnx)        |
| `onnx/decoder_model_merged_quantized.onnx` | [Download](https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/onnx/decoder_model_merged_quantized.onnx) |

Total including accompanying files: **43,613,734 bytes**. Retain the included licenses/model cards when redistributing the prepared build.

### Wav2Vec2 SUPERB ER q4

Source: [onnx-community/wav2vec2-base-superb-er-ONNX — pinned revision `e2191e9e8b692c19c7d96e2a1d789ab1df5b7259`](https://huggingface.co/onnx-community/wav2vec2-base-superb-er-ONNX/tree/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259). [Pinned manifest](apps/web/src/features/vocal/assets.json).

Destination:

```text
apps/web/public/models/vocal-expression/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259/
```

| Required relative path     | Download/source                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.json`              | [Download](https://huggingface.co/onnx-community/wav2vec2-base-superb-er-ONNX/resolve/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259/config.json)              |
| `preprocessor_config.json` | [Download](https://huggingface.co/onnx-community/wav2vec2-base-superb-er-ONNX/resolve/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259/preprocessor_config.json) |
| `onnx/model_q4.onnx`       | [Download](https://huggingface.co/onnx-community/wav2vec2-base-superb-er-ONNX/resolve/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259/onnx/model_q4.onnx)       |
| `README.md`                | [Download](https://huggingface.co/onnx-community/wav2vec2-base-superb-er-ONNX/resolve/e2191e9e8b692c19c7d96e2a1d789ab1df5b7259/README.md)                |
| `LICENSE.txt`              | Copy `node_modules/@huggingface/transformers/LICENSE` after `npm ci`                                                                                     |

Total including accompanying files: **89,879,304 bytes**. Retain the included licenses/model cards when redistributing the prepared build.

### Emotion2vec+ Base FP32

Source: [pankotaro/emotion2vec-plus-base-onnx — pinned revision `334d4376993c381f059cc36d2c6ed05cbfec5ca1`](https://huggingface.co/pankotaro/emotion2vec-plus-base-onnx/tree/334d4376993c381f059cc36d2c6ed05cbfec5ca1). [Pinned manifest](apps/web/src/experiments/vocal/emotion2vec-assets.json).

Destination:

```text
apps/web/public/models/vocal-expression/emotion2vec-base/334d4376993c381f059cc36d2c6ed05cbfec5ca1/
```

| Required relative path       | Download/source                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emotion2vec_plus_base.onnx` | [Download](https://huggingface.co/pankotaro/emotion2vec-plus-base-onnx/resolve/334d4376993c381f059cc36d2c6ed05cbfec5ca1/emotion2vec_plus_base.onnx) |
| `emotion2vec_head.json`      | [Download](https://huggingface.co/pankotaro/emotion2vec-plus-base-onnx/resolve/334d4376993c381f059cc36d2c6ed05cbfec5ca1/emotion2vec_head.json)      |
| `LICENSE`                    | [Download](https://huggingface.co/pankotaro/emotion2vec-plus-base-onnx/resolve/334d4376993c381f059cc36d2c6ed05cbfec5ca1/LICENSE)                    |
| `README.md`                  | [Download](https://huggingface.co/pankotaro/emotion2vec-plus-base-onnx/resolve/334d4376993c381f059cc36d2c6ed05cbfec5ca1/README.md)                  |

Total including accompanying files: **373,295,401 bytes**. Retain the included licenses/model cards when redistributing the prepared build.

### Project-trained facial classifier v3 (kept in Git)

This is the project's own trained model, not an external public download. Its weights are approximately 9 KB. Keep the entire existing bundle together under `packages/classifier/models/v3/`: `model.json`, `weights.bin`, `metadata.json` and `checksums.json`. Do not replace it with Wav2Vec2, Emotion2vec or a MediaPipe file. Root asset verification validates its frozen checksums. Raw reference images, datasets and recordings remain excluded under `/references/`.

### Build/deployment preparation

On a new machine or CI runner, prepare all assets before starting either app or building. The current Vite configurations verify them, including the experimental models; a missing model is a setup error rather than a signal to fetch remotely at runtime. The Web build copies the prepared public model directories into `apps/web/dist/models/`; both apps emit shared facial assets from `packages/classifier/models/`. Deploy the complete `dist/` output, including those local models and WASM files. Never deploy `.certs/` or private development keys.

## Build and validate

```bash
npm run typecheck          # Both apps and classifier package
npm test                   # All existing Lab tests + Web and shared-package tests
npm run lint
npm run build:lab           # apps/lab/dist
npm run build:web           # apps/web/dist
npm run verify:web          # Inspect actual Web output for Lab/training leaks
npm run assets:verify       # MediaPipe/WASM consistency and frozen v3 hashes
```

`npm run build` verifies assets, checks all workspace types, and builds both apps. Existing convenience commands remain: `npm run dev` launches the Lab, `npm run preview` previews its production output on port 4173, and `npm run format` formats source files. Web preview is available via `npm run preview --workspace @expressionlens/web` on port 4174.

The Lab retains a lazy TensorFlow.js chunk and a training worker; Vite's large-chunk warning for these existing dependencies is expected. The Web application lazy-loads MediaPipe and TensorFlow.js for video inference. It does not import Lab tools, training workers, or reference datasets; the build checks module boundaries and published assets.

## Shared inference and model assets

Both applications declare `@expressionlens/classifier` as a workspace dependency. The Lab uses narrow re-export modules at its old import paths to preserve components and tests without duplicating implementations. Training algorithms, dataset persistence/import/export, heuristic rules, temporal smoothing, snapshot handling, and all development interfaces stay in the Lab.

The package exports:

- `createFaceLandmarker()` and the unchanged MediaPipe model identity, delegate, and initialization options.
- `featureNames`, `canonicalFeatures()` and `orderedFeatures()` for the exact ordered **52 raw coefficients**, with no new preprocessing.
- `loadClassifier()` for existing local model/weights/metadata file selections.
- `loadDefaultClassifier()` for the unchanged v3 shipped with the app.
- `inferExpression()` to order captured blendshapes, run the existing classifier session, and interpret the original four probabilities.
- `mapProbabilities()` and `UNCERTAINTY_MARGIN_THRESHOLD = 0.15` with unchanged behavior: `neutral`, `smile`, `surprise`, `angry` are the four trained labels; `uncertain` is only an interpretation when the top-two probability margin is below 0.15. Raw argmax, confidence and probabilities remain available.

The video-analysis adapter uses this package directly. Live camera recording remains out of scope:

```ts
import {
  createFaceLandmarker,
  canonicalFeatures,
  loadDefaultClassifier,
  inferExpression,
} from '@expressionlens/classifier'

// Inference resources are initialized on demand:
const faceLandmarker = await createFaceLandmarker()
const classifier = await loadDefaultClassifier()
// const prediction = await inferExpression(classifier, actualBlendshapes)
// Always dispose the resources when the feature unmounts:
classifier.dispose()
faceLandmarker.close()
```

The shared Vite asset plugin serves and emits only the approved runtime assets under `wasm/`, `models/face_landmarker.task`, and `models/classifier-v3/`. `runtimeAssetUrls()` honors each consuming application's Vite `base`, so these paths work in development and production, including non-root deployments. Deploy the entire app `dist/`, not just its JavaScript directory. A configured app base must also be served by the hosting path.

There is one **source** copy of each runtime model. Each independent deployable build naturally contains its own emitted runtime copies. The original full v3 metadata is preserved in `packages/classifier/models/v3/metadata.json`; the deployable metadata is a projection containing only the fields already accepted by the existing classifier validator. Participant splits, training history, test metrics, and dataset preparation records are not published as product assets. Model topology and weight bytes are unchanged.

## Inspecting the AI engineering work

Start the Lab to collect/import datasets, train/evaluate a model, load exported classifiers, compare rule/neural outputs, or inspect blendshapes. See the [detailed Lab documentation](apps/lab/README.md) for the existing milestone workflows and manual camera/iPhone checks.

All original reference images and exported datasets remain under `references/`. Experimental models v1 and v2 remain there too. Only the three v3 inference files moved from `references/images/syntetic/training/3/` to `packages/classifier/models/v3/`; a README at the former location documents the move. The v3 dataset remains in its original directory. Nothing was deleted or retrained.

Phase 0 preservation checks verified every original reference/model file byte-for-byte, preserved all 182 existing Lab tests, and tested the actual shared v3 against direct TensorFlow inference with the original weights. Training architecture, feature order, classification thresholds, uncertainty logic, and evaluation metrics are unchanged. Web output inspection rejects Lab UI strings, training code/worker files, datasets, experimental model versions, and full training metadata.

Real camera permissions, mobile rendering, downloads and recording-free resource cleanup still need manual browser checks after a structural migration. Automated tests and HTTPS asset checks verify the implementation boundary but do not replace those device checks.

## Phase 1: local video upload and analysis

The Web app now accepts a local prerecorded video, displays a native playback preview plus filename/duration/size/resolution, and analyzes visible facial expressions entirely in the browser. Choosing or previewing a file does not initialize the models. Only **Analyze video** loads the shared MediaPipe implementation and frozen v3 classifier. No file, frame or prediction is uploaded, and no database is used.

### Implementation and sampling

- `apps/web/src/features/analysis/types.ts`: source-independent session/sample/progress types. Detected samples reuse the shared `ProbabilityPrediction` fields (`label`, `rawLabel`, `confidence`, `margin`, `distribution`, `isUncertain`) alongside `timestampMs`. Separate `no-face` and `multiple-faces` statuses have no neural prediction. Sessions support the future `upload | live` source contract, but only upload is implemented.
- `lib/videoSource.ts`: file/metadata validation and a dedicated attached, muted, paused decoder, independent of the visible preview. It waits for loaded data and, for each seek, an actual `seeked` event plus `HAVE_CURRENT_DATA`; changing `currentTime` alone never suffices. A timeout/abort/error removes pending listeners. No frame canvases/copies are retained, no playback or `requestVideoFrameCallback` is required, and video/audio recording is never started.
- `lib/sampling.ts`: configurable `ANALYSIS_FPS = 5`. The grid is `index × 1000 / FPS` milliseconds, starting at 0 and ending strictly before video duration; estimated sample count is `ceil(durationMs × FPS / 1000)`. A 10-second video yields 50 samples at 0, 200, …, 9800 ms. Each grid timestamp is processed once in chronological order. Short fractional tails receive a sample when they contain a grid point.
- `lib/analyzer.ts`: creates the existing shared VIDEO-mode MediaPipe detector and v3 once per job, reuses them across samples, calls `inferExpression`, and releases them after processing. Each job gets a fresh detector so timestamps can restart at 0 without violating MediaPipe's strictly increasing timestamp requirement. There is no temporal smoothing or changed feature preprocessing. As in the Lab, up to two faces are detected to reject multi-person frames; no tracking or second-person classification is implemented.
- `lib/analyzeVideo.ts`: one sequential seek → inference → result loop, with progress updates and a browser yield between frames. There is no concurrent inference on a classifier instance, no Worker infrastructure, and no change to the model's tensor-safe session service.
- `hooks/`: selection/object URL lifecycle and a single analysis job with AbortController plus generation guards. Cancel/replacement/removal/unmount stop future scheduling and suppress late results. If initialization or inference is already running, the UI waits for it to settle before disposing and enabling a new job; it does not falsely promise immediate interruption. Retrying creates fresh resources, while browser/runtime caching avoids re-fetching unchanged assets unnecessarily.
- `components/`: independent video preview, progress/cancellation controls, and a basic summary. Percentages of interpreted categories include uncertain predictions and use **only single-face classified samples** as denominator. Face coverage uses **all sampled frames**; no-face and multi-face skipped counts are separate. Counts are not presented as exact durations. Raw probabilities and argmax remain in each in-memory sample for future reporting.

The Web App/UI, its tests and Vite boundary check, `scripts/verify-web-build.mjs`, this README, and the Web HTML description changed. The shared classifier/model, Lab, training algorithms, evaluation logic and classification thresholds did not change in Phase 1. The build-boundary check now allows the necessary vendor inference libraries while rejecting any module from `apps/lab` or `references`. The published-asset check still rejects Lab tools, training workers, datasets, old experimental models, and full training metadata.

### Manual validation

1. Open [Web App](https://localhost:5174/), choose a short MP4/WebM known to decode on your browser, and check all metadata. Preview play/pause, seek and current position before starting analysis; there should be no model initialization yet.
2. Analyze a video with a readable face. Monitor loading, progress, processed/estimated counts and video timestamp. A precise 10.000-second clip should finish with 50 samples. Preview playback/position should remain independent of the offline decoder, including while analysis runs.
3. Check that detected + no-face + multiple-faces counts equal all sampled frames. Expression counts sum to detected frames, and percentages use that denominator. A video with no visible face must not produce neutral/uncertain predictions or fabricated percentage values.
4. Cancel during loading and during processing. Wait for the current operation to finish safely, then restart. Replace/remove the file while processing and confirm that late results never reappear. Remove the file or leave the page and check media/model cleanup. Results are only in React memory and clear on restart/replacement/navigation.
5. Try an empty/non-video file, unsupported codec, damaged file and missing/unreadable metadata. Errors should be understandable and allow another selection. Model initialization, seek/decode and inference errors should end the job and release its resources.
6. Test on desktop and iPhone/mobile, including a video whose source FPS differs from 5. Browser container/codec support varies; the native decoder may select the same coded source frame at multiple requested times if its FPS is below the sampling rate. The sampling grid is a diagnostic approximation, not an exact expression-duration measurement.
7. Recheck the independent [Development Lab](https://localhost:5173/) and run `npm run typecheck`, `npm test`, `npm run lint`, `npm run build:web`, `npm run build:lab`, and `npm run verify:web`. The shared-package tests load real v3 weights and verify inference/tensor cleanup. Web unit tests mock native video APIs for event synchronization, session creation, no-face/uncertainty, statistics, cancellation/restart, errors, URL cleanup and stale work.

A real short-video browser run, visual/mobile checks, codec compatibility and native decoder behavior remain manual verification; the unit tests do not establish them. Heavy MediaPipe calls run on the main thread and cannot be interrupted mid-call; the loop yields between samples. There is no audio analysis, live recording, session persistence, interactive timeline or advanced report in this phase. Phase 2 below adds the interactive timeline from these retained samples, without changing inference or training.

## Phase 2: interactive expression timeline

Once analysis completes, an expression timeline appears **directly below the existing preview video**. The native video controls and Phase 1 summary remain available. Clicking, dragging, or using the keyboard-accessible native range control seeks that same preview; it does not start analysis, load another model, or change the session. Play, pause, native seeks, restart and end update the playhead and the associated stored prediction.

### Rendering and sample-to-time policy

`apps/web/src/features/timeline/lib/timeline.ts` derives intervals without modifying the original sample timestamps or probabilities. Consecutive observations with the same interpreted category/status are grouped while preserving individual samples for lookup. It handles all four trained categories, uncertain, no-face and multiple-faces. There is no new smoothing.

An observation represents the interval from its timestamp until the earliest of the next sample, one nominal sampling period later, or video end. Boundaries use the original millisecond values, with only sub-microsecond floating-point noise snapped to adjacent boundaries/video end. Missing initial observations, skipped periods and unsupported tails are explicitly **Not analyzed**, never invented predictions. At exactly the end of the video, the final sample is selected only if its supported interval actually reaches video end. Before the first observation, within missing periods, or outside the video, no prediction is selected.

Binary search finds the latest supported observation at/before the playback position in O(log n). Thus probabilities can change between observations even within one visually grouped expression interval. The hover/focus tooltip shows the **actual sample timestamp**, separately from continuous video position, and explains that the interval view is an approximation of discrete sampling, not a classification of every intervening frame.

`components/TimelineOverview.tsx` renders at most **eight SVG paths**, each combining all intervals for one category. A slim line of solid-color segments replaces repeated symbols. A labeled color legend, accessible slider value text and point-specific tooltip provide readable category identification. This keeps the DOM compact for thousands of observations. Derived intervals/path strings are memoized. There is no charting dependency, zoom, pan, or new inference.

### Video synchronization and details

`lib/videoClock.ts` subscribes to the existing preview HTMLVideoElement as the single source of playback time. While playing it keeps at most one requestVideoFrameCallback pending, with requestAnimationFrame fallback when the cancellable video-frame API is unavailable. Native media events update paused/native seeks and the end position as well. Pause and unmount cancel pending callbacks; cleanup removes listeners. There is no competing playback timer or second video player for this feature.

`components/ExpressionTimeline.tsx` updates playhead, native slider value and time output through refs, without a React render per playback frame. React updates when the selected observation or available event navigation changes. The static SVG is memoized; the preview and summary are not rerendered for every clock update. The range is a native accessible control with a visible focus outline, touch-sized hit area and millisecond step. Its track and SVG axis share the thumb travel inset so seeking aligns with the drawn time axis. Browser-native keyboard seeking (including Home/End) remains available, along with Previous/Next event buttons.

`components/PredictionDetails.tsx` appears in a compact tooltip on hover, keyboard focus or touch seeking. It shows the pointed-to time, interpreted category, actual observation timestamp, original model argmax, highest model score, top-two difference in percentage points and all four **stored** probabilities. Hovering does not seek or rerun inference; leaving the timeline, blurring the control or pressing Escape dismisses the tooltip. The tooltip shifts above/below the bar when space requires it. Softmax scores are explicitly not calibrated certainty. No-face, multi-face and unobserved positions display status text without fabricated distributions.

Events are observed interval starts, including no-face/multi-face status transitions. Consecutive same-category observations do not create duplicate events. Previous seeks to the closest strictly earlier observed interval start (the current interval's start when playback is inside it); Next seeks to the closest strictly later start. Missing-data regions do not become expression events. Controls disable at the respective boundaries or when no events exist.

### Changed files and validation

- New `apps/web/src/features/timeline/lib/`: interval generation, binary lookup, event navigation, timestamp formatting, category presentation, media-clock subscription and tests.
- New `components/`: expression timeline, memoized SVG overview and prediction details, plus integration/performance tests.
- New `timeline.css`: responsive compact layout, readable legend, touch/keyboard seeking and focus styles.
- `apps/web/src/features/analysis/components/VideoWorkspace.tsx`: attaches a ref to the existing preview and mounts the timeline only for a completed session.
- `apps/web/src/App.test.tsx`: verifies the complete analysis-to-timeline integration and that navigation does not rerun analysis.
- Root README: current behavior, policy, validation and remaining manual checks.

The Lab, shared classifier, v3 weights, uncertainty threshold, analysis/inference pipeline, sample schema, and model evaluation metrics are unchanged. There are no new dependencies, backend endpoints, recording, transcription, export, or advanced reporting features.

Manual checks for a short local video:

1. Complete Phase 1 analysis. Confirm the timeline is below the same preview and the existing summary remains below the progress/results area.
2. Hover at several points and verify the tooltip shows the pointed-to sample without changing playback time. Then click and drag at several points, including start/end. Confirm the video's currentTime, playhead, selected category, probabilities and actual sample timestamp agree with the documented interval policy. Inspect uncertain, no-face and multi-face observations when present.
3. Play/pause, seek using native controls, restart and reach the end. The timeline should follow without continuing after pause or scheduling extra inference.
4. Use Tab to focus the timeline, arrow keys/Home/End to seek, and Previous/Next event buttons. Check visible focus, boundary disabling and that all categories remain identifiable through the legend and tooltip; Escape should dismiss the tooltip.
5. Replace/remove the file, reanalyze, or leave the page. Verify old callbacks/listeners and predictions do not persist. Test desktop and iPhone touch layouts, especially seeking alignment and no page overflow.
6. Run `npm run typecheck`, `npm test`, `npm run lint`, `npm run build:web`, `npm run build:lab`, and `npm run verify:web`.

Unit tests cover exact/fractional boundaries, gaps, first/last intervals, statuses, empty data, binary lookup, chronological events, native seeking/pause/restart/end, requestVideoFrameCallback and animation-frame fallback/cleanup, stored distributions and zero inference on navigation. A 2,000-sample test verifies the SVG path bound. Real-video analysis, native keyboard/touch behavior, visual layouts and mobile playback synchronization still require the browser checks above; mocked media APIs do not establish them.

## Phase 3: session export/import

The Web app now exports a completed analysis to versioned JSON (`schemaVersion: 1`) and restores saved predictions without initializing MediaPipe/TensorFlow.js or rerunning inference. The original video stays separate. Imported sessions work immediately with the same timeline/tooltips, event navigation and statistics, using an offline review cursor until a video is connected.

Use **Export Session** to save results and **Import Session** to reopen them. Imports validate every record before replacing current results; invalid files preserve the active session/video, and valid replacements require confirmation. **Select Original Video** compares metadata (250 ms duration tolerance) and requires explicit confirmation for differences. Metadata matching is not proof of identical content. Disconnecting retains the saved analysis.

See the [Web App documentation and schema v1 reference](apps/web/README.md) for the JSON contract, validation bounds, reconnection workflow, privacy and manual checks. There is no database, cloud storage, automatic persistence or video data embedded in JSON. Exported expression observations can be sensitive; users control storage and sharing.

## Phase 4: live recording, then offline analysis

The Web App now offers **Record Video** alongside Upload Video and Import Session. Camera+microphone permissions are requested only after Enable camera & microphone. Recording uses native MediaRecorder with negotiated formats, a configurable 10-minute limit, final-chunk collection, local review/download and device cleanup. It never runs inference while recording.

Analyze Recording explicitly sends the resulting File through the existing video pipeline. Sessions keep `source: 'live'` and remain compatible with JSON schema v1, the existing timeline/statistics and original-video reconnection. The Blob/audio are neither uploaded nor re-encoded, and no persistent recording storage is introduced. See the [recording workflow, compatibility and manual checks](apps/web/README.md).

### Experimental browser speech-to-text (Phase 5A)

The isolated Web page is available at `https://localhost:5174/experiments/stt/` after `npm run dev:web`. It downloads multilingual Whisper only on explicit request and transcribes local media in a Worker, without uploading audio or changing facial-analysis sessions. See [STT spike setup, limitations and manual experiments](apps/web/src/experiments/stt/README.md). Desktop/mobile runtime benchmarks remain pending.

### Integrated speech transcription (Phase 5B)

At `https://localhost:5174/`, choose facial expressions, speech, or both sequentially for uploaded/completed recorded videos. Whisper/WASM loads on request, keeps audio local, and adds text/segments to the same session/video timeline. Phase 5B originally introduced version 2; current exports use version 3 and versions 1/2 still import. See [Phase 5B migration, testing and limitations](apps/web/src/features/speech/README.md).

### Self-hosted Whisper assets

Both STT workflows now use pinned, same-origin Whisper Tiny q8 assets. Runtime users do not access Hugging Face. `npm run assets:whisper` reproduces missing assets at development time; Web builds verify their hashes. See [asset size, paths, caching and production verification](apps/web/WHISPER_ASSETS.md).

### Experimental vocal expression analysis (Phase 6A)

`https://localhost:5174/experiments/vocal/` provides an isolated acoustic-classification spike with a pinned, self-hosted ONNX model. See [model research and measured limitations](apps/web/src/experiments/vocal/README.md). No session schema or facial/STT workflow integration is added.

### Integrated vocal analysis (Phase 6B)

The product now supports any nonempty combination of facial expression, transcription and configured SER vocal analysis. Audio decoding is shared when both audio modalities are selected; inference runs sequentially. New session exports use schemaVersion 3 and import v1/v2/v3. The isolated experiment retains both vocal models. See [integration, schema and desktop/mobile checks](apps/web/src/features/vocal/README.md).

## Provisional, reversible SER choice

Emotion2vec+ Base is now selected for product vocal analysis, with original nine-class scores and three-second windows. Both models remain fully available in the internal Lab and on disk. Set `ACTIVE_SER_MODEL` in `apps/web/src/features/vocal/config.ts` to `'wav2vec2'` to restore Wav2Vec2, or `'emotion2vec'` to select Emotion2vec. Historical sessions use their recorded model metadata, never the current setting. No removal or automatic winner selection is authorized by this switch.
