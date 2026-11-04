# Self-hosted Whisper Tiny q8

The product and `/experiments/stt/` share the same local Worker, model bytes and cache paths. The model ID remains `onnx-community/whisper-tiny`; the runtime now loads a local directory, never the Hub. Transformers.js remains 4.3.2, dtype q8, with unchanged WASM execution, audio preprocessing, transcription options and timestamp merging.

## Pinned assets

Upstream revision: **`ff4177021cc41f7db950912b73ea4fdf7d01d8e7`** of [onnx-community/whisper-tiny](https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7). This freezes the `main` revision selected for self-hosting, rather than resolving mutable `main` on future builds. No re-quantization, model conversion or training is performed.

Files are byte-for-byte upstream copies. [The committed manifest](src/features/speech/whisper-assets.json) records SHA-256 and exact byte counts for all seven, plus upstream Git blob IDs for the JSON files. The ONNX SHA-256 values match the upstream LFS object hashes.

Source directory:

```text
apps/web/public/models/whisper-tiny-q8/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/
```

Vite copies this directory unchanged into `apps/web/dist/models/whisper-tiny-q8/...`. Runtime URLs are relative to the application's base path, for example `/models/whisper-tiny-q8/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/config.json`.

| File                                       |                                 Bytes |
| ------------------------------------------ | ------------------------------------: |
| `config.json`                              |                                 2,243 |
| `generation_config.json`                   |                                 3,772 |
| `preprocessor_config.json`                 |                                   339 |
| `tokenizer.json`                           |                             2,480,466 |
| `tokenizer_config.json`                    |                               282,683 |
| `onnx/encoder_model_quantized.onnx`        |                            10,124,990 |
| `onnx/decoder_model_merged_quantized.onnx` |                            30,719,241 |
| **Total**                                  | **43,613,734 (43.61 MB / 41.59 MiB)** |

These are the files consumed by the installed pipeline. Tokenizer vocabulary, merges and added-token data are already embedded in `tokenizer.json`; separate vocab/merges files and alternative ONNX variants are not requested. Upstream model provenance points to [openai/whisper-tiny](https://huggingface.co/openai/whisper-tiny); retain applicable upstream attribution/licensing when distributing these assets.

## Reproduce or verify

From the repository root using Node >=22.12:

```sh
npm run assets:whisper
npm run assets:whisper:verify
npm run build:web
npm run verify:web
```

The **development/build-time** downloader uses only the pinned revision and file list. Matching local files are reused without network requests; missing/corrupt files are downloaded, checked against size/SHA-256, then atomically renamed into place. A failed/HTML/LFS-pointer download is rejected. Files are downloaded into the Git-ignored `public/models/` directory and excluded from formatting to preserve the upstream byte hashes. Source manifests/checksums stay committed; see the root README for fresh-clone setup. `npm run assets:whisper` is the only step that needs Hugging Face access when obtaining missing files; there is no automatic build-time or runtime Hub fallback. Both the root Web build and Vite configuration fail with an actionable error if local assets are missing or changed. Production verification checks the copied files again.

## Runtime boundary and lazy loading

`features/speech/lib/localModel.ts` configures:

- `env.allowLocalModels = true` and `env.allowRemoteModels = false`.
- `local_files_only: true` in the pipeline options.
- A pinned, same-origin local directory shared by both interfaces.
- Same-origin-only `env.fetch` with `redirect: error`; a local endpoint cannot silently redirect model requests to a CDN. Metadata/cache candidate URLs also stay on the local origin.
- CSP `connect-src 'self'` on both entry pages, with no Hugging Face domain allowances.

Merely opening either page requests **no Whisper model files**. The product starts the Worker only for explicit speech analysis; the experiment starts it on Load model. No model preload/prefetch was added. MediaPipe, TensorFlow.js and the facial model are untouched.

## Browser caching

`env.useBrowserCache = true` preserves Transformers.js's `transformers-cache` Cache API use when the browser exposes it. Model entries use the new same-origin revision-specific URLs; old Hub cache entries are not required. Cache API persistence depends on availability, browser quotas, eviction and user/site-data clearing.

The Vite dev/production-preview middleware serves the pinned model routes with:

```http
Cache-Control: public, max-age=31536000, immutable
Content-Length: <verified file size>
```

This also enables normal HTTP caching, including when the Cache API is unavailable. The revision in each URL is essential: changing model bytes requires a **new revision path**, not replacing bytes under an immutable URL. A static deployment must preserve all seven files and configure the same cache header for `/models/whisper-tiny-q8/<revision>/*`; headers are server configuration, not encoded in the files. Cache API support remains independently enabled by the app. Missing/unknown local model files return 404 in dev/preview instead of SPA HTML, with remote fallback disabled.

There is **no Service Worker or full offline guarantee**. The application itself must still be reachable/available, and browser caches can be cleared or evicted.

## Production verification (2026-11-03)

Verified the built `dist/` through HTTPS Vite preview in the in-app desktop browser:

- Opening the product generated no Whisper asset requests.
- Explicitly loading the experiment requested all seven model files exclusively under the local `/models/whisper-tiny-q8/<revision>/` prefix; the preview request log recorded the exact filenames. No missing auxiliary assets or remote fallback were needed.
- Unload/reload on the same origin reached Ready again (2.34 s) without new model GETs in the server log, confirming cache reuse in this browser.
- A direct production response for the encoder ONNX was HTTP 200, `Content-Length: 10124990`, with the immutable cache header above.
- The model reached Ready on WASM. Synthetic English speech (7.31 s) produced the expected text and two valid timestamped segments: 3.01 s inference, RTF .411. Synthetic Spanish speech (6.44 s) stayed in Spanish with two valid segments: 3.27 s inference, RTF .509. The tiny model made a minor Spanish wording error (`se procesan` for `se procesa en`); this smoke test is not an accuracy benchmark.
- Automated checks cover local-only flags, lazy configuration/no eager fetch, same-origin URLs, redirect blocking, revision paths and hashes; the existing shared-pipeline/integrated-workflow tests remain in place.

To reproduce the request audit in a fresh browser origin/cache, run:

```sh
WHISPER_ASSET_AUDIT=1 npm run preview --workspace @expressionlens/web -- --host 127.0.0.1 --port 4175
```

Open the product first, then the experiment and Load model. Only requested model files are logged. Use browser Network to inspect any deployed host, and compare a cold load with unload/reload on the same origin. Do not confuse model initialization time with inference time. Physical-mobile performance and broad accuracy comparisons remain separate manual tests.
