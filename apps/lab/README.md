> **Monorepo note:** This is the detailed documentation for `apps/lab`. Run installation, HTTPS setup, and workspace commands from the repository project root; see the [root README](../../README.md). Local `src/` paths below are relative to `apps/lab`. Shared inference now lives in `packages/classifier`; original reference datasets/experiments stay at root `references/`, with the v3 model files relocated to the shared package. Historical milestone instructions below describe the preserved Lab workflows.

# ExpressionLens Lab — Facial Expression, Dataset & Training

Milestones 1, 2.1, 3, 4, and 5: a React + TypeScript + Vite laboratory for browser-local facial analysis with MediaPipe, plus a labeled facial-feature Dataset Collector. Images and camera frames are never uploaded or recorded. The collector persists numerical coefficients and metadata locally. A separate Training tab trains and exports a TensorFlow.js expression classifier locally. No backend, audio capture, interview sessions, or interview reports are included. The experimental rule-based baseline supports neutral, smile, surprise, and angry, and can be compared live against a locally loaded neural classifier.

## Requirements and installation

Use Node **22.12+** (Node 24 LTS recommended), npm, and a modern camera-capable browser. If you use nvm, run `nvm use` first. The lockfile records the stable package versions used for this implementation.

```sh
npm ci
```

The install lifecycle copies the installed MediaPipe package's WASM files into `public/wasm/`. If your npm policy disables lifecycle scripts, run `node scripts/sync-wasm.mjs` explicitly. The official Face Landmarker v1 bundle is already included under `public/models/`, together with its SHA-256 checksum. Restore it if missing with `npm run assets:model` (network required during setup only). Model initialization at runtime uses the app's own origin; it never contacts a CDN.

## HTTPS development and mobile access

Vite uses HTTPS by default, listens on your network, and uses port **5173**. Certificates remain outside the public directory and are ignored by Git.

Install [mkcert](https://github.com/FiloSottile/mkcert) if needed (macOS: `brew install mkcert`), then generate a development certificate containing your Mac's current LAN IP:

```sh
npm run https:setup -- 192.168.1.121
npm run dev
```

Replace the example IP with yours. Open `https://localhost:5173` on your computer, or the HTTPS Network URL printed by Vite on a phone connected to the same Wi-Fi. If your LAN IP changes, rerun `https:setup` with the new address and restart Vite. Use the URL matching the IP in the certificate. Guest Wi-Fi isolation and your Mac firewall may prevent access between devices.

The development certificate is signed by mkcert's local CA. Each test device must trust that CA before camera access works reliably:

- **Mac:** run `mkcert -install` yourself to add the local CA to the system trust store. This can require your administrator password. Restart the browser if necessary.
- **iPhone / iPad:** transfer **only** the public `rootCA.pem` from the directory printed by `mkcert -CAROOT` (for example with AirDrop). Install the downloaded profile in Settings, then enable its trust in Settings → General → About → Certificate Trust Settings. See [Apple's certificate trust instructions](https://support.apple.com/en-gb/102390).
- **Android:** transfer the same public root certificate and install it as a CA certificate using the device's Security / Encryption & credentials settings. Menu names depend on the manufacturer. See [mkcert's mobile notes](https://github.com/FiloSottile/mkcert#mobile-devices).

The setup script also exports a copy of the **public** root certificate at `.certs/rootCA.crt` for transfer to the phone. Never transfer `rootCA-key.pem` or `dev-key.pem`. Trusting a local CA allows certificates signed by that CA; keep its private key on this development machine and remove the mobile profile when finished testing. A certificate warning means trust is not configured yet: finish installing the CA rather than proceeding through the warning.

The certificate setup script generates the server certificate only; it does not install or change system trust. None of these development certificates are needed in production.

## Build, checks, and deployment

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

The build verifies the model checksum and that local WASM assets match the installed MediaPipe version, then checks TypeScript and writes a static `dist/` folder. `preview` serves that build at `https://localhost:4173`, using the same development certificates. `npm run format` formats the project's sources.

Deploy all of `dist/`, including `models/` and `wasm/`, to a static host with a valid public HTTPS certificate. No application backend or cross-origin isolation headers are required. Serve `.wasm` as `application/wasm` and the `.task` bundle as binary data. Preserve file paths and avoid rewriting asset requests to HTML. For a subdirectory deployment, build with `npm run build -- --base=/expressionlens/`; model and WASM paths follow Vite's base URL. Verify missing files return errors rather than your SPA HTML. Development TLS keys must never be deployed.

## Using the lab

Click **Start Camera** to request video-only permission, prefer the front camera, and load the local model. Camera permission is never requested on page load. **Stop** releases tracks, clears the preview and readings, and cancels inference. Video is started explicitly with `play()` instead of the autoplay attribute. If playback is paused, **Resume video** retries playback using a user gesture without requesting a new camera stream. It also cancels a pending permission request from the application's perspective: any stream later returned by the browser is immediately released.

The inspector displays exactly the categories returned by MediaPipe, typically 52, including `_neutral`. Values are real model output, rounded to three decimals; bars cover 0–1. Sort by score or name and search case-insensitively. Eight relevant movement coefficients are highlighted. No face, paused video, a hidden page, or a stream stalled for over 1.5 seconds clears readings rather than presenting old values as current.

The default target is **10 FPS**, adjustable to 5, 15, or 20. Diagnostics show camera/model state, face presence, actual inference rate, rolling average inference duration, coefficient count, and configured CPU/WASM delegate. FPS is calculated from actual inference timestamps over the last second; duration averages up to 30 calls. A dash means no current face observation. A detection failure offers a model retry without needing to request camera access again.

## Architecture

- `src/hooks/useCamera.ts` owns permission, stream and video playback, disconnection handling, race cancellation, and cleanup.
- `src/lib/mediapipe.ts` creates the CPU/WASM Face Landmarker using local assets: VIDEO mode, one face, blendshapes enabled, transformation matrices disabled.
- `src/hooks/useFaceLandmarker.ts` owns model lifetime, initialization retry, a single synchronous inference loop, diagnostics, and stale-data handling. It creates one model after the first Start and reuses it across camera stops. It closes the model on unmount or explicit retry, including initialization finishing after unmount.
- Frame scheduling uses `requestVideoFrameCallback`, falling back to `requestAnimationFrame` plus `video.currentTime`. If the native API exists but stops delivering callbacks for over 1.5 seconds while video is playable and the page is visible, the watchdog cancels the pending callback and switches to the fallback. Diagnostics shows the active scheduler, callback and completed-inference counts, video dimensions, playback time, readyState, and the current reason for waiting. These counters remain visible even before the first inference. Presented-frame counters are preferred over potentially repeated stream timestamps; the fallback uses decoded-frame counts when available, then stream time. Native frame callbacks can establish readiness when dimensions are valid even if the reported readyState lags. It checks frame timestamps, throttles inference, and cancels scheduled callbacks during cleanup. React updates occur per inference, not per display frame.
- `src/lib/expressionRules.ts` evaluates four visible-expression categories with configurable thresholds and comparable movement scores. Smile still requires both mouthSmile coefficients ≥ 0.45; surprise still requires jawOpen ≥ 0.45 and browInnerUp ≥ 0.25. Angry combines bilateral brow lowering with squint/lip press/mouth frown, and optionally mouth stretch for a clenched mouth. All 14 relevant coefficients must be present and finite within [0,1]. The highest supported score wins; near ties fall back to Neutral. These experimental labels describe visible patterns, **not emotional state**. The heuristic uses no neural classifier.
- Presentation components handle camera controls, expression details, the searchable inspector, and diagnostics. Only the displayed preview is mirrored with CSS; model input remains unmirrored, preserving subject-relative left and right.

## Known limitations and verification

`detectForVideo()` is synchronous and can block the main thread on slower devices. Start with 5–10 FPS on mobile; a worker is intentionally deferred until profiling justifies the complexity. The CPU delegate may use internal graphics resources during image processing; there is no automatic GPU delegate selection. Browser/WASM compatibility, thermal throttling, camera hardware, lighting, occlusion, and backgrounding affect results. A multi-megabyte model plus WASM downloads from your static host are needed on first use; no service worker or offline-install feature is included. Normal browser caching may help subsequent loads.

Rules are a baseline, without personalization, hysteresis, confidence calibration, or emotional meaning. Neutral means neither rule matched; other visible expressions can also fall into that fallback.

Unit tests cover actual-output rule handling, threshold boundaries, camera permission races, unmount/disconnection cleanup, frame throttling, duplicate-frame prevention, loss-of-face clearing, model reuse, and model initialization finishing after unmount. Additional regression tests simulate native callbacks that never arrive or stall after a valid frame, verify fallback handoff without duplicate inference, and check distinct camera/model/frame/face status messages. Further tests cover repeated media timestamps, presented-frame identity, readiness lag, waiting diagnostics, and resuming the existing stream. Browser automation was not completed because access to the local preview was declined; physical camera accuracy and mobile layout/performance still require manual validation.

### Manual device checklist

1. Open the trusted HTTPS URL on desktop and on real iOS Safari / Android Chrome. Confirm there is no horizontal scrolling in portrait or landscape.
2. Confirm no permission prompt before Start. Test deny → recover through browser permissions, missing/busy cameras, and a disconnected camera.
3. Start: confirm the mirrored live view, model readiness, face detection, **52 returned coefficients**, real changes when smiling, blinking, lifting brows, and opening your mouth. Surprise requires raised brows as well as an open jaw.
4. Check sorting, filtering, highlighted coefficients, and values underlying Smile / Surprise / Neutral. Remove your face and confirm stale coefficients disappear.
5. Switch target FPS and check observed rate/duration. Background the page, return, and test device rotation and interruption by another app.
6. Stop, restart several times, and navigate away. Confirm the camera indicator turns off on Stop/unmount, scores clear, and inference stops. Test Stop while permission is pending.
7. Inspect browser Network requests: model, WASM, and app assets should come only from this host; there should be no camera uploads, analytics, or recording requests. Verify the deployed production build separately from Vite development/HMR.

## References and third-party assets

- [Official MediaPipe web integration guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [Official model description and model cards](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker#models)
- [Versioned official Face Landmarker bundle](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
- [MediaPipe source and Apache-2.0 license](https://github.com/google-ai-edge/mediapipe)
- [Vite HTTPS configuration](https://vite.dev/config/server-options#server-https)

WASM files are copied unmodified from `@mediapipe/tasks-vision` (Apache-2.0). Model source and SHA-256 are recorded above / under `public/models/`; consult Google's model cards for intended uses and limitations.

## Milestone 2.1 — Dataset Collector

Open **Dataset Collector** in the top navigation. **Facial Expression Lab** remains a separate view and retains its existing camera, blendshape inspector, expressions, diagnostics, and mobile frame-scheduling recovery. Switching application views releases the camera; switching collection modes closes that mode's model/resources. Navigation is disabled during a running import or an unsaved webcam capture so you can finish, cancel, save, or discard first.

### Import synthetic or real photos

1. Choose **Import images** and select `neutral`, `smile`, `surprise`, or `angry`. Every image in a batch receives this expression label.
2. Choose the **Import mode**:
   - **Different identities** is the default for synthetic images. Each image is treated as a different synthetic person and receives a new cryptographic UUID participant ID, unique across batches. No manual participant ID is requested. Source is synthetic.
   - **Same identity** preserves the original behavior. Enter or reuse an anonymous participant ID such as `person-001`; every image in that batch uses it. Reuse the ID for other expression batches of the same person. This mode supports synthetic and real images. Selecting source Real switches to Same identity; switching source back to Synthetic defaults to Different identities.
3. Select multiple JPEG, PNG, or WebP files, or drag them into the drop area. Use Same identity whenever a person repeats across images/expressions; automatic IDs are an import assumption, not face recognition. For the initial 200-person synthetic dataset, import four Different identities batches of 50 images: neutral, smile, surprise, and angry.
4. Processing is sequential with a separate lazy IMAGE-mode Face Landmarker configured to find up to two faces. Exactly one detected face and all 52 valid coefficients are required. Missing faces, multiple detected faces, corrupt/unsupported images, and invalid coefficients are reported rather than saved.
5. Successful samples are committed immediately, one per image, under a new batch session ID. Progress reports saved, failed, and unprocessed files. Cancel skips remaining files and preserves samples already committed. A storage failure stops the batch with an error. Decoded images and object URLs are released after each file; no photos/previews are persisted.

Inputs are limited to **30 MB / 25 megapixels per image** and are downscaled to a maximum 1280-pixel edge for inference. HEIC, animated/video imports, and files with unknown MIME types are not supported. Convert them to a supported still-image format first. Only the latest 100 image failure messages are displayed, alongside the full failure count.

### Collect real webcam samples

1. Choose **Capture with webcam**, enter the participant ID, and select the expression and a 3-, 5-, or 10-second capture duration.
2. Click **Start Camera** and wait for the local model to be ready. Click **Start countdown** and prepare during the 3-second countdown.
3. Perform the chosen expression. The existing video pipeline runs at approximately **5 FPS**, with up to two-face detection so frames with multiple faces can be excluded. Only fresh, complete, exactly-one-face results inside the capture time window are accepted. There is no second inference loop and no recording.
4. When the capture finishes, the camera stops. Inspect the captured vectors, then choose **Save samples** or **Discard capture**. Until Save is clicked, captured samples live only in memory. An interrupted/hidden page ends the capture and offers partial samples for review. You may also end early or Stop the camera.

Expect roughly 15 / 25 / 50 samples for the three durations under ideal conditions; slow devices, missed detections, or invalid frames reduce the count. All frames in one capture share one session ID and participant ID, and source is always `real`. If iOS pauses playback, **Resume video** reuses the existing camera stream.

### Review, statistics, and local storage

The overview reports total samples, distinct participants/sessions, real vs synthetic totals, and sample/participant counts per class. It warns for classes with fewer than **20 samples**, including missing classes, and for datasets with only one participant. These reminders do not certify model quality or independence of consecutive samples. No splitting or training is performed in the collector; use the separate Training tab.

Sample review filters by expression, participant substring, and source; it displays **20 samples per page**. Inspect the canonical 52 values, edit labels/participant IDs, or delete individual samples. Edits preserve the sample ID, session, original timestamp, source, and optional source filename. No facial photograph is reconstructed.

Native **IndexedDB** stores sanitized numerical samples and a separate versioned metadata record; localStorage is not used. Errors such as unavailable/private-mode storage, blocked database upgrades, quota exhaustion, and ID collisions are surfaced. Focus refreshes the local view. Clear dataset requires typing **DELETE** and explicitly confirming; it cannot be undone without a JSON backup.

**Storage belongs to a browser and origin.** `localhost`, a LAN IP, different ports/protocols, desktop vs mobile, and different browsers have separate databases. Browser data eviction or deletion can remove the dataset. Export backups regularly; use JSON to move or merge samples across devices. Changes made in another tab are refreshed on focus, with uniqueness enforced by IndexedDB transactions.

### JSON backup and merge

**Export dataset JSON** downloads the entire dataset. iOS may open its normal download/share flow. The file contains dataset schema version `1`, feature schema type/version, all 52 canonical names in exact order, the configured official model asset identifier `face_landmarker/float16/1` and SHA-256, export time, and all sample metadata/features. The SDK/npm version is not presented as the model version.

**Import dataset JSON** validates the entire file before saving anything. A preview shows samples, participants, sessions, class/source totals, existing-ID duplicates to skip, and the number of new samples. Explicitly click **Import new samples** to commit. Duplicate IDs inside a file are rejected; existing IDs are skipped (even if contents differ). The final IndexedDB insert is atomic and cannot silently overwrite another tab's samples; a concurrent collision aborts the transaction and refreshes the preview.

Legacy exported `frown` labels are normalized to `angry` during validation/import, with all other sample metadata and features preserved. Existing IndexedDB v1 databases are upgraded transactionally to database v2, renaming stored frown labels in place. Dataset and feature schema versions remain 1; new exports use angry. Reload older tabs if a database upgrade is blocked.

Wrong dataset/feature versions, names/order, model identity/hash, unsupported labels, identifiers, timestamps, and invalid vectors are rejected with actionable messages. Feature arrays must contain exactly 52 finite numbers in [0,1]. Unknown extra fields, such as embedded image payloads, are not persisted. Export preserves IDs, participant/session grouping, labels, source, timestamps, and optional source filenames.

JSON parsing, the local overview, and export currently load the numerical dataset into memory; very large datasets may exceed device memory. Image batches remain sequential. There is no resumable bulk JSON parser, automatic migration between schemas/models, global synchronization, identity recognition, or live neural-classifier integration in the collector.

### Dataset architecture and changed files

- `src/App.tsx`: view navigation; the existing lab presentation moved to `src/components/FacialExpressionLab.tsx`. `CameraPreview.tsx` gains an optional disabled Start control.
- `src/lib/mediapipe.ts`: retains the original default VIDEO/one-face configuration; accepts IMAGE/VIDEO and one/two-face options and exposes explicit model asset metadata. No IMAGE/VIDEO switching is performed on a running instance.
- `src/hooks/useFaceLandmarker.ts` and `src/types/face.ts`: expose actual detected face count and inference timestamp, keeping existing frame scheduling and mobile recovery. The collector reuses this same hook at 5 FPS / two faces; the lab stays at its original settings.
- `src/features/dataset/types/dataset.ts`: shared labels, sample, and versioned dataset types.
- `src/features/dataset/lib/featureSchema.ts`, `datasetValidation.ts`, `datasetStatistics.ts`, `datasetExport.ts`, `datasetStorage.ts`: canonical ordering, strict validation, quality statistics, backups/merge planning, and atomic IndexedDB access, independent of React.
- `src/features/dataset/lib/imageFeatureExtraction.ts`, `imageBatch.ts`, `webcamCapture.ts`: image decoding/inference/cleanup, explicit batch identity policy with UUIDs per image or a shared manual participant, and pure webcam sampling-window logic.
- `src/features/dataset/hooks/useDataset.ts`, `components/`, `dataset.css`: persistence lifecycle and responsive collection/review UI.
- `index.html`: a same-origin Content Security Policy blocks third-party runtime connections, including the metrics endpoint present in the installed MediaPipe SDK. The app does not call telemetry APIs; blocked SDK network attempts can appear as CSP messages in the browser console. Model/WASM assets remain on the application origin.
- Tests use Vitest/Testing Library and `fake-indexeddb` (development only). Added coverage includes feature ordering, invalid vectors, schema/model compatibility, JSON round trips and duplicate summaries, participant/session statistics, IndexedDB persistence/edits/atomic collision rollback/quota errors, image cleanup/cancellation, webcam countdown/one-face sampling/review/save/discard, explicit clear confirmation, model asset hash, privacy policy, and navigation back to the existing lab.

The canonical list follows [Google's official blendshape graph](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_blendshapes_graph.cc), including `_neutral` as the first of 52 inputs. It is a schema definition, not a list of fabricated scores.

### Manual acceptance checks for the new collector

Implementation checks passed: TypeScript, Oxlint without warnings, **85 automated tests**, and the Vite production build. The HTTPS development server also returned HTTP 200 with certificate verification enabled.

Automated tests mock inference and image decoding; they do not establish real-world extraction accuracy. Browser automation was not used because local preview inspection was previously declined. Validate this new view on desktop and your iPhone/Chrome:

1. Confirm the existing Facial Expression Lab still starts/stops and detects expressions.
2. Import supported real/synthetic photos in both identity modes, including no-face/multiple-face/corrupt examples. Confirm success/failure counts, cancellation behavior, labels, participant/session grouping, and canonical coefficient inspection.
3. Capture each expression with one person, then try multiple faces and briefly leaving the frame. Verify countdown, approximate capture rate, partial capture handling, Save/Discard, and camera release after capture or leaving the view.
4. Reload the same HTTPS origin and verify saved samples, filters, edits, deletion, and totals persist. Verify you must type DELETE before clearing all data.
5. Export, clear only after backing up, then import the JSON. Confirm metadata and features survive. Reimport it to see existing IDs skipped; import an older frown export and verify it appears as angry without losing metadata; try reordered names, a different schema/model, invalid labels/features, or duplicate IDs and confirm rejection.
6. Check Network: no external metrics requests or image uploads should leave the browser. Model/WASM requests must remain local to the same origin. Browser photos, recordings, and image blobs must not appear in IndexedDB.

## Milestone 3 — Browser-based classifier training

Open **Training** in the application navigation. The lab's camera/MediaPipe implementation and live rule-based detector are unchanged. The training UI reads numerical samples only and never edits or deletes your original dataset. It does not replace live predictions with the neural network.

### Manual training workflow

1. Keep the existing HTTPS application running (`nvm use`, `npm ci` if dependencies changed, then `npm run dev`). Open the same browser/origin used to collect data.
2. Open **Training**. It automatically loads an IndexedDB snapshot. **Load IndexedDB dataset** refreshes it; **Use dataset JSON** validates a previously exported file directly in memory without adding it to IndexedDB.
3. Review validation, original/usable counts, duplicate exclusions, and the class/participant distribution in training, validation, and test. All four labels must be represented: **neutral, smile, surprise, angry**, in that exact output order. Old `frown` exports still normalize to angry through the existing dataset validator.
4. Keep seed **42** or select another unsigned 32-bit integer **before** training. Do not choose seeds/models based on held-out test scores. Start training only once the split is valid. There must be at least **three distinct participants per class after deduplication** to place each class in all three partitions; there is no requirement for exactly 50 images per class.
5. Click **Start training**. Watch epoch counts, training/validation loss and accuracy, and the two learning curves. The epoch-history table exposes full numeric values. The worker can be cancelled; cancellation produces no usable/exportable model. Keep mobile browsers in the foreground to avoid background throttling.
6. After training, review the **held-out test** accuracy, per-class precision/recall/F1/support, macro-F1, and confusion matrix. Rows are actual labels and columns are predicted labels. For a synthetic-only test set, the result is explicitly labeled **Synthetic-data evaluation**. This is not validated real-world performance or an assessment of emotional state.
7. Download **model.json**, **weights.bin**, and **metadata.json** individually. Keep the three files from the same run in one folder with their original names: model.json references weights.bin. Separate buttons avoid relying on browsers permitting automatic multiple downloads (important on mobile). Download before leaving/reloading the Training tab: trained artifacts live only in memory, and are not saved to IndexedDB automatically.

### Preparation and reproducible splitting

The existing schema/model/feature-order/sample validator is reused, including unique sample IDs and 52 finite [0,1] coefficients. A second guard in the training worker rejects accidental sample, participant, or exact-vector leakage between prepared partitions before creating tensors.

Duplicate detection happens **globally before splitting**, using the full exact numerical vector (no approximate similarity threshold). For same-label duplicates, keep one representative chosen by stable sample-ID ordering; exclude the other copies from every partition. If an identical vector has conflicting labels, exclude **all** rows in that group rather than arbitrarily picking a label. The duplicate-exclusion count includes those conflicting rows; the UI separately reports conflicting groups/sample counts. Nothing is removed from the stored dataset or source JSON.

Splitting targets **70% train / 15% validation / 15% test**, stratified by the four class counts while treating each participant as an indivisible group across all sessions/expressions. The deterministic algorithm uses a seeded PRNG, locale-independent ID ordering, 16 grouped greedy starts and improving group moves to minimize class/size deviations. Every split must contain all classes; if the heuristic cannot find such an assignment, it blocks training with a collection hint rather than leaking identities. A necessary minimum is three participant groups per class. Counts can differ from exact percentages because of rounding and group sizes. The UI and metadata record the actual counts. Tests cover 200 one-image participants with 50 samples/class (140/30/30 overall) and repeated people across classes.

The seed fixes split membership, row ordering, and seeded Glorot initialization. Fit uses the already seeded training order with `shuffle: false`, avoiding TensorFlow.js's unseeded per-epoch shuffle. Exact floating-point training results are not promised across different TF.js versions, devices, or future backends. The metadata records the version, backend, seed, and split sample/participant membership.

### Model, early stopping, and held-out evaluation

The production dependency is **`@tensorflow/tfjs` 4.22.0**. It is bundled locally; no CDN assets, backend, native TensorFlow package, or external training service is used.

The model is the requested small MLP: **52 → Dense(32, ReLU) → Dense(16, ReLU) → Dense(4, Softmax)**. Input coefficients are already bounded [0,1] and are used directly without additional normalization. Training uses Adam at **0.001**, categorical cross-entropy, accuracy, batch size **16**, a maximum of **100 epochs**, and patience **10** on validation loss.

The installed TF.js callback does not implement `restoreBestWeights: true`, so the training module explicitly clones a checkpoint whenever validation loss strictly improves, counts consecutive non-improving epochs, stops at patience, and restores the best checkpoint before evaluating/exporting. Superseded checkpoints are disposed. Training and validation tensors, prediction temporaries, model weights, and Adam state are disposed in a `finally` block. Integration tests check tensor counts return to baseline and that the exported model restores the best epoch rather than the last epoch's weights.

Fit receives **training tensors** and separate **validation tensors** only. Test samples do not enter fit, early stopping, or parameter selection. After restoring the validation-selected weights, a single forward pass predicts the test classes once per completed run; all requested metrics are calculated from those held-out predictions. Macro-F1 is the unweighted mean over the fixed four classes; undefined precision/recall denominators yield zero. There is no separate repeated-test evaluation button. Repeated experimentation against the same exposed test score can still bias human model selection: use an untouched external evaluation dataset for future serious comparisons.

### Worker, export, and metadata

Training runs on the **CPU backend in a dedicated module Web Worker**, separate from the main UI and MediaPipe's graphics resources. The TF.js worker bundle is loaded only when training starts. The main thread receives one progress update per epoch and final numerical results; charts use local SVG without another UI/chart dependency. Terminating/cancelling/unmounting stops the worker and releases its realm. Browser support, memory, and startup/training failures are surfaced in the UI. Training is slower on low-power phones, and browsers can throttle background tabs/workers.

The trained model is serialized into memory with a TensorFlow.js save handler, then transferred as JSON plus an ArrayBuffer. Export is standard Layers-model JSON with a single weights.bin manifest entry. Metadata version 1 includes:

- Architecture, raw-input preprocessing contract, and label order.
- Dataset/feature schema versions and all 52 feature names in their exact order.
- Official MediaPipe model asset identifier and SHA-256.
- Optimizer/loss/accuracy settings, learning rate, batch size, max epochs, patience, seed, actual/best epochs, best validation loss, stopping reason, TF.js version, and CPU backend.
- Target and actual split sizes, per-class/source/participant counts, and exact sample/participant split membership.
- Duplicate/conflict exclusion report, training history, held-out test metrics, evaluation source domain, limitations, and UTC training timestamp.

These exports can now be loaded by the Milestone 4 comparison interface. The Training tab itself only trains and exports; there is no model upload, network save handler, or new model-storage database. The existing same-origin CSP continues to block external network requests, including third-party telemetry.

### Changed files and verification

- `src/App.tsx`: adds Training navigation and prevents switching views during an active run.
- `src/features/training/types/training.ts`: typed configuration, label order, prepared partitions, metrics, artifacts, and worker messages.
- `src/features/training/lib/prepareDataset.ts`, `splitDataset.ts`, `random.ts`, `trainingGuards.ts`: non-mutating validation/deduplication, reproducible grouping/stratification, and leakage checks.
- `src/features/training/lib/trainModel.ts`, `earlyStopping.ts`, `metrics.ts`, `training.worker.ts`, `modelExport.ts`: model creation, explicit best-checkpoint restoration, one-pass test evaluation, worker lifecycle, and file export.
- `src/features/training/hooks/useTraining.ts`, `components/`, `training.css`: loading snapshots/JSON, worker orchestration, progress/curves, evaluation, responsive layout, and exports.
- `package.json` / `package-lock.json`: TensorFlow.js dependency. One existing mocked canvas test's type annotation was adapted to the WebGPU declarations brought by TF.js; the MediaPipe extraction implementation was not changed.

Milestone 3 verification passed: TypeScript, Oxlint without warnings, **107 automated tests**, and the Vite production build (including the separate training worker bundle).

Automated verification includes actual TensorFlow.js CPU training, standard-model serialization/reloading, tensor cleanup, controlled early-stopping weight restoration, numerical metrics, group-disjoint reproducibility, deduplication/conflict handling, invalid data/seeds, worker cancellation/error cleanup, and training from IndexedDB/JSON without writing the source dataset. Browser Worker startup, mobile interaction/layout, and actual browser file downloads still require the manual workflow above; no browser UI inspection was performed after the earlier local-preview access denial.

References: [TensorFlow.js training guide](https://www.tensorflow.org/js/guide/train_models), [save/load guide](https://www.tensorflow.org/js/guide/save_load), and [the TF.js early-stopping implementation](https://github.com/tensorflow/tfjs/blob/tfjs-v4.22.0/tfjs-layers/src/callbacks.ts).

## Milestone 4 — Live rule / neural comparison

The existing **Facial Expression Lab** now supports optional neural predictions alongside the experimental four-category rule baseline. Dataset Collector and Training remain available. No new dependencies were added: this reuses the installed TensorFlow.js package and loads its browser runtime lazily only when you load a classifier.

### Exact local testing steps

1. Start HTTPS with `nvm use` and `npm run dev` if needed. Open the trusted local URL on desktop or the Network HTTPS URL on a phone connected to the same Wi-Fi. The mobile device still needs to trust the development CA as described above. Fully reload after updating the application.
2. Open **Facial Expression Lab**. Under **Neural classifier model**, select **Model JSON** (`model.json`), **Weight file(s)** (`weights.bin`, or all shards named by the manifest), and **Metadata JSON** (`metadata.json`) from **the same exported training run**. Keep weight filenames as referenced by the manifest; browser-renamed copies such as `weights (1).bin` must be renamed or replaced with the correctly named original.
3. Click **Load selected model**. Loading a replacement unloads the previous model first. Ready status shows the local model filename, a generated per-load identifier, training timestamp where present, label order, preprocessing, and matched MediaPipe identity. No files are uploaded. To select another model, expand **Load / replace model files**. **Unload model** releases model tensors; cancelling an unfinished load also prevents that model from becoming active later.
4. Click **Start Camera**, keep exactly one face visible, and enable **Comparison mode**. The rule and neural panels are side by side on wide desktop screens and stacked on mobile. With no neural model loaded, the rules still work. Turn comparison off to suspend neural inference while keeping the camera and rules available.
5. Compare expressions and the four probability bars. Choose **disabled / low / medium / high** smoothing and optionally **Show raw prediction**. **Show diagnostics** reveals/hides MediaPipe FPS, latest NN inference duration/highest probability, loaded model ID, shared frame timestamp, inference errors, and the original camera/model diagnostics. Expand **Inspect all 52 live blendshape coefficients** for the original inspector.
6. Test removing your face, adding a second face, stopping/restarting, changing smoothing, unloading, and replacing the model. Predictions must clear on invalid/stopped frames and old async results must never reappear after replacement/unload. **Resume video** remains available for mobile playback interruption.
7. Optionally enable **Manual evaluation**, choose your intended expression, and click **Capture evaluation sample** while a current paired prediction is available. Perform several expressions, inspect each rule/neural match and their separate agreement percentages, then click **Export evaluation JSON**. You can export after stopping the camera. The target describes **your intention**, not objective ground truth. Both detectors support all four targets, including angry. Evaluation rows include a snapshot of the current heuristic thresholds and scores.
8. Hiding the manual evaluation section preserves its rows in memory while you remain in the lab. **Clear evaluation rows** removes only those in-memory rows. Leaving the lab or reloading discards unsaved captures; export first. Nothing is added to the training dataset or IndexedDB automatically. Dataset backup and model training still work independently.

### Model and feature compatibility

The loader calls `tf.loadLayersModel(tf.io.browserFiles(...))`, using only selected local files. It checks metadata version/type, dataset and feature schema versions, the exact 52 names/order, exact label order **neutral, smile, surprise, angry**, and raw-input preprocessing `{type: 'none', featureCount: 52, featureRange: [0,1]}`. It compares the required MediaPipe name, configured asset version, and SHA-256 against the application's known local model identity; missing or mismatched identity is rejected rather than assumed compatible. The build verifies that configured model hash against the local asset.

Currently supported classifier exports are sequential dense MLPs with one `[batch,52]` input and one `[batch,4]` softmax output. Actual loaded layer units/activations must match the supplied architecture metadata. Different feature orders, normalization/scaling, legacy classifier label orders, missing shards, duplicate shard basenames, remote/parent weight paths, malformed fixed-width weight byte sizes, incompatible shapes, or metadata/layer mismatches produce explicit errors. Legacy `frown` dataset import remains supported in the collector; neural model label metadata must use the canonical angry label. Use unmodified files from one training export: compatibility checks do not establish that arbitrarily mixed files came from the same training run.

The loader performs a zero-input warm-up to validate output probabilities before exposing the model. Warm-up output is never shown or captured as a webcam result. During live inference, the 52 values are extracted by **name** into the metadata's ordered schema, validated, and passed directly as `[1,52]`; there is no normalization or scaling. Output probabilities are validated and mapped through the loaded metadata's `labelOrder`, not fixed positional labels.

### One camera, one detection stream, paired predictions

The lab still uses `useCamera` and the original `useFaceLandmarker` loop, including its iPhone frame-scheduling fixes. The lab requests up to **two detected faces from the same instance** so it can reject ambiguous frames. This is a detection limit, not permission to classify two people: only an exactly-one-face result is eligible for either comparison prediction. The rule function and thresholds in `src/lib/expressionRules.ts` are unchanged. MediaPipe's own one-face-only temporal filtering may differ when configured for two faces; no second camera or detector is created.

A separate inference controller consumes immutable MediaPipe snapshots. Only one neural inference can be in flight; newer valid detections are coalesced to the latest pending snapshot instead of building a queue. A completed result includes its original frame, rule result, raw and primary neural distributions, model identity, smoothing, and timing. The rule panel displays that **same completed frame** while comparing, rather than a newer independent detection. Invalid frames clear the displayed pair immediately; stale asynchronous results after face loss, stop, unload, replacement, disabled comparison, or unmount are ignored.

The CPU backend is used for this small classifier to avoid sharing WebGL state with MediaPipe. Tensor creation/prediction uses `tf.tidy`, output reads are followed by explicit disposal, and model disposal is deferred until any in-flight output read completes. First runtime loading can briefly affect responsiveness; larger compatible networks and slow phones can still take noticeably longer. Diagnostics reports the latest inference time, and the MediaPipe target FPS remains adjustable. The existing MediaPipe synchronous/main-thread limitations still apply.

### Smoothing and manual evaluation semantics

Smoothing uses an immediate exponential moving average over the four probabilities, with alpha **1.0 / 0.8 / 0.5 / 0.3** for disabled/low/medium/high. It does not wait to fill a frame buffer. Primary output uses the averaged distribution when enabled; raw output remains available for debugging and exports. State resets on stop, model/settings changes, multiple faces, invalid/stalled source reset, or a gap of at least **500 ms between valid predictions**. No-face observations hide predictions immediately; a shorter temporary loss can retain internal EMA history until a fresh face returns.

A manual capture requires a paired frame no older than **500 ms** and exactly one face. Each row stores an ISO capture timestamp, performance-relative source frame timestamp, intended target, rule prediction with its heuristic thresholds/scores, primary neural prediction/probabilities, raw neural prediction/probabilities, inference duration, per-load model ID/name/training timestamp, and smoothing level. It stores no photo, video, or blendshape training vector. JSON includes separate rule/neural agreement accuracies, per-model summaries, all rows, and limitations. A table can contain different models/settings across rows, so inspect their identifiers when comparing results.

All outputs describe observable expression categories, not actual emotions, honesty, personality, or interview suitability. Synthetic held-out accuracy/F1 figures are not claims of real-world performance; manual intended-label agreement is not an objective measurement of emotional state.

### Files and verification

- `src/features/comparison/lib/compatibility.ts`, `loadClassifier.ts`: metadata/manifest validation, local browser IO, actual architecture validation, lazy CPU runtime, model sessions, and tensor/model disposal.
- `probabilities.ts`, `smoothing.ts`, `livePredictor.ts`, `manualEvaluation.ts`: named feature ordering, metadata-based probability mapping, EMA resets, one-operation inference/coalescing and invalidation, paired evaluation/export.
- `src/features/comparison/hooks/`: race-safe model load/unload and the adapter from the existing MediaPipe snapshots.
- `src/features/comparison/components/`, `comparison.css`, `types/`: local model selection, neural bars, diagnostics, optional manual captures, responsive comparison layout, and strongly typed contracts.
- `src/components/FacialExpressionLab.tsx`: integrates comparison and controls using its existing camera/detector. `ExpressionPreview.tsx` adds an optional title and explicit multi-face presentation without changing rule logic. `CameraPreview.tsx` can display the multi-face state.
- Unit/integration tests cover schema/identity/preprocessing/shape compatibility, exact feature ordering, metadata probability mapping, all smoothing levels/resets, pending-inference invalidation and coalescing, frame-paired rendering, manual capture freshness/agreement/export, model replacement/unmount races, real exported file loading through browserFiles, and repeated prediction/disposal tensor counts.

Current checks passed: TypeScript, Oxlint without warnings, **182 automated tests**, and the Vite production build.

The TensorFlow.js runtime is a separate lazily loaded browser chunk. Vite may report a large-chunk warning for that dependency; it is not loaded for heuristic-only use. Browser UI inspection remains unverified after the earlier local-preview permission denial. Tests execute browser file IO with jsdom and actual TensorFlow.js CPU math, but real camera responsiveness, iPhone interaction, layout, and browser download behavior still need the manual steps above.

## Four-category heuristic baseline

The neural classifier, its training, raw features, probabilities, and smoothing are unchanged. Only the experimental movement baseline and comparison presentation have been extended. There is no new model or retraining.

Open **Heuristic debugging & thresholds** below the rule prediction to inspect all four scores and the 14 relevant coefficients. Open **Tune thresholds (this lab session)** to adjust thresholds in [0,1], or reset defaults. Changes last until leaving/reloading the lab. They immediately re-score the same completed comparison frame without running the network again or resetting its smoothing. Manual evaluation captures/exported JSON preserve the settings and scores used for each new row; earlier rows stay unchanged.

The rules use the minimum of left/right coefficients to require bilateral evidence:

- Smile: both mouthSmile coefficients cross `smileMin` (0.45). Visible teeth, mouth stretch, and squint alone provide no smile evidence.
- Surprise: jawOpen crosses 0.45 and browInnerUp crosses 0.25.
- Angry with closed lips: both browDown coefficients cross 0.30, jawOpen is at most 0.25, and bilateral eyeSquint (0.20), mouthPress (0.20), or mouthFrown (0.20) provides another tension cue.
- Angry with a clenched mouth: the same brow/tension combination plus both mouthStretch coefficients crossing 0.25, with jawOpen at most 0.55. MediaPipe has no direct teeth-visibility coefficient; these are movement proxies, not a teeth detector.

Each minimum gate produces zero below its threshold, 0.5 at the threshold, and increases linearly to 1 at maximum activation when the threshold is below 1 (a threshold of 1 only accepts full activation, scoring 0.5). A pattern score is the weakest required gate; angry takes the strongest supported closed/clenched pattern. Smile, surprise, and angry compete on the same scale without a fixed class priority. Neutral is the fallback when none qualifies, or when the top two supported scores differ by at most the configurable ambiguity margin (default 0.03). Its debug score is 1 when no movement pattern qualifies and 0 otherwise, including ambiguous fallbacks. **Scores are not probabilities, are not calibrated across people, and do not sum to 1.** Thresholds and the scoring formula are tunable hypotheses, not scientifically validated emotion detection rules.

Manual checks with one face in good light:

1. Compare a relaxed face, smile, and open-mouth raised-brow surprise against the previous baseline behavior. For mixed patterns, the strongest score now wins instead of surprise always taking priority.
2. Try furrowed brows with closed/pressed lips, then a clenched/stretched mouth with furrow and squint. Inspect which bilateral gates cross their thresholds. Individual faces may need tuning.
3. Compare a smiling mouth with visible teeth against an angry clenched mouth with visible teeth. The former needs lifted smile corners; mouth stretching alone should produce neither smile nor angry.
4. Adjust Angry brow down minimum above the measured brow values: angry should lose its supporting evidence while the neural probabilities remain unchanged for that completed frame. Reset defaults.
5. Capture an angry manual evaluation sample, export JSON, and inspect `rulePrediction`, `heuristic.thresholds`, and `heuristic.scores`. Stop the camera or show two faces and verify predictions clear.

Automated coverage includes incomplete/invalid inputs, inclusive thresholds, configurable gates, closed lips, clenched mouth, asymmetric/isolated cues, smile-vs-angry stretch patterns, score competition and ambiguity, shared-frame threshold changes, and manual export snapshots. Real camera/iPhone checks remain manual.

## Milestone 5: Blendshape Inspector

Open **Blendshape Inspector** in the application navigation. This separate diagnostic view reuses `useCamera`, `useFaceLandmarker` (10 FPS, up to two faces to reject ambiguous captures), `CameraPreview`, the existing coefficient visualization, and the compatible TensorFlow.js model loader. Only the active page owns camera/model resources; leaving the inspector releases them through the existing hooks. No new dependency, classifier, threshold adjustment, retraining, dataset augmentation, or inference-pipeline change is introduced.

### Manual workflow

1. Start the camera and grant permission. Wait for **Ready: 52 coefficients from one face**. The live inspector shows names, values, and activation bars. Filter by name, sort by score/name, and toggle facial-region grouping. Grouped sorting applies within Eyebrows, Eyes, Mouth, Jaw, Cheeks, Nose, and Other; disable grouping for a global sort.
2. Optionally load the exported `model.json`, weight file(s), and `metadata.json` **inside this tab**. Models are released on tab changes, so a model previously loaded in the Lab must be loaded here again. Without one, captures clearly record neural prediction as unavailable.
3. Select `smile`, add a description such as “smile showing teeth,” make that expression, and click **Capture snapshot**. Repeat with `angry` and “clenched teeth, furrowed brows.” Neutral, surprise, repeated labels, and any other pairing of the four labels work the same way. Labels mean the user's intended expression, never verified ground truth.
4. Inspect the captured cards: rule prediction and four heuristic scores; neural prediction, highest probability, and all four class probabilities when available. Expand a snapshot to see its full 52-feature vector, MediaPipe version/SHA-256, and the unchanged default heuristic thresholds used for that capture.
5. Choose any two distinct **Snapshot A / Snapshot B** entries. The comparison defaults to absolute difference descending. Try alphabetical, A activation, and B activation sorts. Inspect paired bars, the highlighted top differences, the top-10 summary, mean absolute difference across 52 features, Euclidean distance, and cosine similarity. A zero vector makes cosine undefined; the UI says so explicitly.
6. For repeated captures, select each into **Group A** or **Group B**. A capture can belong to only one group. Compare per-feature group means using the same table and diagnostic measures. Group counts are snapshot counts: consecutive frames of one person are correlated observations, not independent participants. Groups can contain any intended labels; inspect their descriptions before interpreting averages.
7. Click **Export inspector JSON**. Clear snapshots, then import that JSON and verify features, labels, descriptions, timestamps, and predictions round-trip. Try an existing Dataset Collector export or a file with shuffled feature names: import should fail without changing current snapshots. Imports merge atomically; duplicate IDs, including IDs already in memory, are rejected. Clear before re-importing the same export.
8. Try no face, two faces, camera stop, and a denied camera permission: capture must remain unavailable. Test on iPhone as well as desktop. Changing application tabs should stop the previous camera stream. Confirm Dataset Collector and Training still work independently.

Snapshots survive application tab changes in memory, but not a browser reload. Export before reloading or closing the app. Group selections/comparison controls reset when leaving the inspector. Inspector snapshots are **never written to Dataset Collector IndexedDB** or used for training automatically. No raw images or video are captured, exported, or uploaded.

### Capture, calculations, and JSON

Capture requires exactly one detected face, a complete valid 52-coefficient vector, and a frame no older than 500 ms. Feature values are copied synchronously into the shared canonical order before any asynchronous neural prediction. Both classifiers use that frozen vector. The network runs once per requested capture using its existing tensor-safe prediction service, with raw probabilities and **no temporal smoothing**. A neural failure preserves the diagnostic vector/rule result with an explicit unavailable reason. Captures/model changes and JSON import are coordinated to prevent overlapping writes.

The measures describe numerical differences only: they are not validated expression-similarity measures, proof of a person's emotions, or evidence that a feature caused a classifier output. The existing heuristic thresholds remain experimental hypotheses.

Inspector JSON has its own type `interview-mirror-blendshape-inspector`, schema version 1, export timestamp, exact ordered feature schema, MediaPipe identity, and snapshot records. Each snapshot contains a UUID, wall-clock and source-frame timestamps, intended label, optional description, numerical features, its MediaPipe identity, rule result/scores/thresholds, and neural availability or prediction/probabilities/model identification. Import validates the envelope, exact feature order, four supported labels, unique IDs, timestamps, finite bounded coefficients/scores/thresholds, model identification, and normalized/consistent neural predictions. Unknown fields are stripped. Files are limited to 50 MB and collections to 10,000 snapshots. Imported raw predictions remain historical records and are not recomputed; old snapshots gain an uncertainty interpretation calculated from their saved probabilities.

### Files and verification

- `src/features/inspector/types.ts`: strongly typed snapshots/export envelope.
- `src/features/inspector/lib/capture.ts`: valid-frame capture and same-vector classifier predictions.
- `src/features/inspector/lib/comparison.ts`: per-feature differences, top 10, group means, distances, and facial-region mapping.
- `src/features/inspector/lib/serialization.ts`: isolated JSON validation, merge, export, and download.
- `src/features/inspector/components/`: inspector page, isolated live camera/capture view, lazy snapshot details, reusable comparison table, and UI tests.
- `src/features/inspector/inspector.css`: responsive inspector layout and comparison styles.
- `src/components/BlendshapeInspector.tsx`: optional regional grouping added to the shared live visualization.
- `src/App.tsx` and `src/App.test.tsx`: inspector navigation and session-memory snapshot ownership.

The live view updates independently of snapshot history and comparison tables, so camera frames do not re-render historical captures. Coefficient filtering/sorting and comparisons are memoized; captured coefficient details render only when opened. Tests cover feature ordering, same-vector asynchronous capture, freshness/face-count guards, neural failure, JSON round-trips and malformed inputs, group calculations, zero vectors, sorting/group selection, and application navigation. Existing dataset/training/classifier tests remain in place. Camera/iPhone behavior and browser downloads still require the manual workflow above; automated tests do not replace those checks.

## Neural prediction uncertainty

`src/features/comparison/lib/probabilities.ts` exports the configurable constant `UNCERTAINTY_MARGIN_THRESHOLD = 0.15`. After ranking the four probabilities, a top-two margin **below** this threshold yields `uncertain`; a margin equal to or above it keeps the argmax class. Comparison tolerates floating-point roundoff at the exact boundary. This is an interpretation rule, not a fifth trained class, a calibrated uncertainty estimate, or a change to model architecture, weights, data, training, or heuristic thresholds.

Each neural prediction now exposes `rawLabel` (four-class argmax), `label` (including uncertain), `confidence` (highest probability), `margin`, `distribution` (the original four values in their original order), and `isUncertain`. Neither probabilities nor class confidence are renormalized. The live UI displays **❔ Uncertain** with neutral styling for ambiguous results, while preserving the raw argmax and full distribution for inspection. The existing temporal smoothing is unchanged: the primary live interpretation uses its displayed, potentially smoothed probabilities; the optional raw-frame view preserves the unsmoothed model prediction and its separate interpretation. Inspector captures always use the unsmoothed captured-vector prediction.

Snapshot JSON remains inspector schema version 1 with additive prediction fields. New exports preserve both raw and interpreted results. Imports validate the new fields against the distribution. Older exports with only `label`, `confidence`, and `distribution` are accepted when their saved label matches the original argmax; the missing interpretation is derived from those saved probabilities without running the model again. Partially supplied or inconsistent new prediction fields are rejected.

Training/validation accuracy, test accuracy, precision, recall, F1, and confusion matrices still evaluate the original four-class output; the training pipeline and metrics modules are unchanged. Manual comparison agreement likewise scores its existing four-class argmax, with the interpreted label stored separately in `neuralInterpretedLabel`. Table headers/captions distinguish raw agreement from interpretation. No interpreted accuracy or coverage metric is introduced.

To check manually, load the current classifier and inspect an ambiguous neutral/angry frame. A distribution such as neutral 0.55 / angry 0.44 / smile 0.008 / surprise 0.002 should show Uncertain and an 11-percentage-point margin. Capture it in the Inspector and export/import JSON: `rawLabel` should remain neutral, `label` should be uncertain, and all four probabilities should be unchanged. A confident neutral 0.80 / angry 0.18 / smile 0.01 / surprise 0.01 should remain neutral. Check the live smoothing selector and raw-frame view separately. Camera/browser checks remain manual.

## Pretrained model setup

Downloaded pretrained models are excluded from Git. After `npm ci`, run `npm run assets:setup` from the repository root before development or building. Exact download links, revisions, files and destination directories are listed in the [root README](../../README.md#download-and-place-pretrained-models). The small project-trained facial classifier v3 remains versioned. Prepared builds still self-host all model/runtime files; nothing is downloaded from external origins during browser inference.
