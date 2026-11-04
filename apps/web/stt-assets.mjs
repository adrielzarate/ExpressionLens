import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
// Resolve the runtime belonging to the installed Transformers.js version.
const runtime = new URL('./', pathToFileURL(require.resolve('onnxruntime-web/webgpu')))
const files = ['', '.asyncify'].flatMap((suffix) =>
  ['mjs', 'wasm'].map((extension) => `ort-wasm-simd-threaded${suffix}.${extension}`),
)
export function speechRuntimeAssets() {
  return {
    name: 'isolated-speech-runtime',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split('?')[0].replace(/^\/stt-runtime\//, '')
        if (!request.url?.startsWith('/stt-runtime/') || !files.includes(name)) return next()
        response.setHeader(
          'Content-Type',
          name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        )
        response.end(readFileSync(new URL(name, runtime)))
      })
    },
    generateBundle() {
      for (const name of files)
        this.emitFile({
          type: 'asset',
          fileName: `stt-runtime/${name}`,
          source: readFileSync(new URL(name, runtime)),
        })
    },
  }
}
