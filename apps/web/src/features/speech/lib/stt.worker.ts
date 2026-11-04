import { env, pipeline } from '@huggingface/transformers'
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { configureLocalWhisper } from './localModel'
import type { Request, Response } from './protocol'
const send = (response: Response) => self.postMessage(response)
const modelPath = configureLocalWhisper(env, self.location.origin)
// Same-origin runtime assets; never fetch executable code from a model host.
const wasm = env.backends.onnx.wasm!
wasm.numThreads = 1
wasm.proxy = false
// Match Transformers.js's Safari <26 fallback when WebGPU is absent.
const safari = /Version\/(\d+).*Safari/.exec(navigator.userAgent)
const suffix = safari && Number(safari[1]) < 26 && !('gpu' in navigator) ? '' : '.asyncify'
const base = new URL('/stt-runtime/', self.location.origin)
wasm.wasmPaths = {
  mjs: new URL(`ort-wasm-simd-threaded${suffix}.mjs`, base).href,
  wasm: new URL(`ort-wasm-simd-threaded${suffix}.wasm`, base).href,
}
let model: AutomaticSpeechRecognitionPipeline | undefined
let busy = false
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  if (busy) {
    send({ type: 'error', message: 'Another model operation is already running.' })
    return
  }
  busy = true
  try {
    if (data.type === 'load') {
      if (model) throw new Error('Unload the existing model before loading another backend.')
      if (data.backend === 'webgpu') {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
        if (!gpu || !(await gpu.requestAdapter()))
          throw new Error('WebGPU is unavailable in this Worker; explicitly select WASM.')
      }
      const start = performance.now()
      model = await pipeline('automatic-speech-recognition', modelPath, {
        local_files_only: true,
        device: data.backend,
        dtype: 'q8',
        progress_callback: (event) => {
          const file = 'file' in event ? String(event.file) : ''
          const percent =
            'progress' in event && typeof event.progress === 'number'
              ? ` ${event.progress.toFixed(0)}%`
              : ''
          send({ type: 'progress', message: `${event.status} ${file}${percent}` })
        },
      })
      send({ type: 'ready', loadMs: performance.now() - start })
    } else if (data.type === 'dispose') {
      await model?.dispose()
      model = undefined
      send({ type: 'disposed' })
    } else {
      if (!model) throw new Error('Load the model first.')
      const start = performance.now()
      const output = await model(data.audio, {
        task: 'transcribe',
        ...(data.language === 'auto' ? {} : { language: data.language }),
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      })
      send({ type: 'result', output, inferenceMs: performance.now() - start })
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  } finally {
    busy = false
  }
}
