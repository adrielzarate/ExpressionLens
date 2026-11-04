import { vocalWasmPaths } from './runtime'
import { env, pipeline } from '@huggingface/transformers'
import manifest from '../assets.json'
export const path = `${import.meta.env.BASE_URL}${manifest.publicPath}/`
env.allowLocalModels = true
env.allowRemoteModels = false
env.localModelPath = path
env.remoteHost = `${self.location.origin}/`
env.useBrowserCache = true
const localFetch = env.fetch.bind(env)
env.fetch = (input, init) => {
  const url = new URL(input, self.location.origin)
  if (url.origin !== self.location.origin) throw new Error('External SER asset request blocked.')
  return localFetch(url.href, { ...init, redirect: 'error' })
}
export const wasm = env.backends.onnx.wasm!
wasm.numThreads = 1
wasm.proxy = false
wasm.wasmPaths = vocalWasmPaths()

export async function loadWav2vec(progress: (message: string) => void) {
  const model = await pipeline('audio-classification', path, {
    device: 'wasm',
    dtype: 'q4',
    local_files_only: true,
    progress_callback: (value) =>
      progress(
        `${value.status} ${'file' in value ? value.file : ''}${'progress' in value ? ` ${Number(value.progress).toFixed(0)}%` : ''}`,
      ),
  })
  const mapping = (model.model.config as unknown as Record<string, unknown>).id2label
  if (!mapping || typeof mapping !== 'object')
    throw new Error('SER config has no id2label mapping.')
  const labels = Object.entries(mapping)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, label]) => String(label))
  if (labels.length < 2 || new Set(labels).size !== labels.length)
    throw new Error('Invalid SER class mapping.')
  const extractor = model.processor.feature_extractor
  if (!extractor) throw new Error('Missing SER feature extractor.')
  const config = extractor.config
  const rate = Number(config.sampling_rate)
  if (rate !== 16000 || config.feature_extractor_type !== 'Wav2Vec2FeatureExtractor')
    throw new Error('Unsupported SER preprocessing configuration.')

  return {
    labels,
    sampleRate: rate,
    normalize: config.do_normalize === true,
    classify: (pcm: Float32Array) => model(pcm, { top_k: labels.length }),
    dispose: () => model.dispose(),
  }
}
