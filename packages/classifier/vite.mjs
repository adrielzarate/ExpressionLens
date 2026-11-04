// The loader validates this projection. Do not ship training history, participant
// splits or evaluation artifacts with the product's runtime model metadata.
function inferenceMetadata(metadata) {
  return Object.fromEntries(
    [
      'schemaVersion',
      'metadataVersion',
      'type',
      'featureSchema',
      'modelInfo',
      'labelOrder',
      'architecture',
      'preprocessing',
      'trainedAt',
      'evaluationDomain',
    ].map((key) => [key, metadata[key]]),
  )
}
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))

// One source of deployable assets for both apps. Full training metadata stays
// in the source archive; runtime metadata contains only validated inference fields.
export async function classifierAssetEntries() {
  const entries = new Map()
  for (const name of ['face_landmarker.task', 'face_landmarker.sha256']) {
    entries.set(`models/${name}`, await readFile(join(root, 'models', name)))
  }
  for (const name of ['model.json', 'weights.bin', 'metadata.json']) {
    const bytes = await readFile(join(root, 'models/v3', name))
    entries.set(
      `models/classifier-v3/${name}`,
      name === 'metadata.json'
        ? Buffer.from(JSON.stringify(inferenceMetadata(JSON.parse(bytes.toString())), null, 2))
        : bytes,
    )
  }
  const directory = join(root, '.generated/wasm')
  for (const name of await readdir(directory)) {
    entries.set(`wasm/${name}`, await readFile(join(directory, name)))
  }
  return entries
}
/** @returns {import('vite').Plugin} */
export function classifierAssets() {
  let base = '/'
  let entries
  return {
    name: 'expressionlens-classifier-assets',
    async configResolved(config) {
      base = config.base
      entries = await classifierAssetEntries()
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!pathname.startsWith(base) || !['GET', 'HEAD'].includes(request.method ?? 'GET'))
          return next()
        const name = pathname.slice(base.length)
        const data = entries.get(name)
        if (!data) return next()
        response.setHeader(
          'Content-Type',
          name.endsWith('.json')
            ? 'application/json'
            : name.endsWith('.wasm')
              ? 'application/wasm'
              : name.endsWith('.js')
                ? 'text/javascript'
                : 'application/octet-stream',
        )
        response.setHeader('Content-Length', data.length)
        response.end(request.method === 'HEAD' ? undefined : data)
      })
    },
    generateBundle() {
      for (const [fileName, source] of entries) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
