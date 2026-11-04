import * as ort from 'onnxruntime-web/webgpu'
import manifest from '../../../experiments/vocal/emotion2vec-assets.json'
import { classifyFeatures, parseHead } from './emotion-head'
async function asset(path: string, progress: (message: string) => void) {
  const file = manifest.files.find((f) => f.path === path)
  if (!file) throw new Error('Unknown Emotion2vec asset.')
  const url = new URL(
    `${import.meta.env.BASE_URL}${manifest.publicPath}/${path}`,
    self.location.origin,
  )
  if (url.origin !== self.location.origin) throw new Error('External Emotion2vec asset blocked.')
  let cache: Cache | undefined
  try {
    cache = await caches.open('interview-mirror-vocal-assets-v1')
  } catch {
    /* HTTP cache still applies. */
  }
  let response: Response | undefined
  try {
    response = await cache?.match(url.href)
  } catch {
    cache = undefined
  }
  const cached = !!response
  response ??= await fetch(url.href, { redirect: 'error' })
  if (!response.ok) throw new Error(`Emotion2vec asset HTTP ${response.status}`)
  // Consume both tee branches concurrently, avoiding a full unconsumed response buffer.
  const storing =
    !cached && cache ? cache.put(url.href, response.clone()).catch(() => {}) : Promise.resolve()
  const buffer = new Uint8Array(file.bytes)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Cannot read Emotion2vec asset.')
  let offset = 0,
    last = -1
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.length > buffer.length) throw new Error('Emotion2vec asset size mismatch.')
      buffer.set(value, offset)
      offset += value.length
      const percent = Math.floor((offset / buffer.length) * 100)
      if (percent !== last) {
        last = percent
        progress(`Loading ${path}: ${percent}%${cached ? ' (cached)' : ''}`)
      }
    }
  } finally {
    reader.releaseLock()
  }
  await storing
  if (offset !== buffer.length) throw new Error('Incomplete Emotion2vec asset.')
  return buffer
}
export async function loadEmotion2vec(
  wasmPaths: { mjs: string; wasm: string },
  progress: (message: string) => void,
) {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  ort.env.wasm.wasmPaths = wasmPaths
  const head = parseHead(
    JSON.parse(new TextDecoder().decode(await asset('emotion2vec_head.json', progress))),
  )
  const bytes = await asset('emotion2vec_plus_base.onnx', progress)
  progress('Initializing Emotion2vec+ Base FP32 on WASM…')
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
  if (session.inputNames.length !== 1 || session.outputNames.length !== 1) {
    await session.release()
    throw new Error('Unexpected Emotion2vec graph signature.')
  }
  return {
    labels: head.labels,
    async classify(pcm: Float32Array) {
      const input = new ort.Tensor('float32', pcm, [1, pcm.length])
      let output: ort.InferenceSession.ReturnType | undefined
      try {
        output = await session.run({ [session.inputNames[0]]: input })
        const features = output[session.outputNames[0]]
        if (
          !(features.data instanceof Float32Array) ||
          features.dims.length !== 3 ||
          features.dims[0] !== 1 ||
          features.dims[2] !== 768
        )
          throw new Error('Unexpected Emotion2vec features.')
        return classifyFeatures(features.data, features.dims[1], head)
      } finally {
        input.dispose()
        if (output) for (const tensor of Object.values(output)) tensor.dispose()
      }
    },
    dispose: () => session.release(),
  }
}
