import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { manifest, verifyWhisperAssets } from './whisper-assets.mjs'
import { vocalManifests, verifyVocalAssets } from './vocal-assets.mjs'
const root = new URL('../apps/web/dist/', import.meta.url)
const allowedRuntime = new Set([
  'experiments/vocal/index.html',
  ...vocalManifests.flatMap((m) => m.files.map((file) => `${m.publicPath}/${file.path}`)),
  ...manifest.files.map((file) => `${manifest.publicPath}/${file.path}`),
  'stt-runtime/ort-wasm-simd-threaded.mjs',
  'stt-runtime/ort-wasm-simd-threaded.wasm',
  'stt-runtime/ort-wasm-simd-threaded.asyncify.mjs',
  'stt-runtime/ort-wasm-simd-threaded.asyncify.wasm',
  'experiments/stt/index.html',
  'models/face_landmarker.task',
  'models/face_landmarker.sha256',
  'models/classifier-v3/model.json',
  'models/classifier-v3/weights.bin',
  'models/classifier-v3/metadata.json',
])
async function inspect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`
    const url = new URL(entry.name, directory)
    if (entry.isDirectory()) await inspect(new URL(`${entry.name}/`, directory), `${path}/`)
    else {
      if (
        !allowedRuntime.has(path) &&
        !path.startsWith('wasm/') &&
        !path.startsWith('assets/') &&
        path !== 'index.html'
      )
        throw new Error(`Unexpected Web output: ${path}`)
      if (/references|dataset|training\.worker|classifier-v[12]/i.test(path))
        throw new Error(`Lab-only asset in Web: ${path}`)
      if (path.startsWith('assets/') || path === 'index.html') {
        const contents = await readFile(url, 'utf8')
        if (
          /Dataset Collector|Blendshape Inspector|Classifier Training|Facial Expression Lab|TrainingPage|prepareDataset|splitDataset/.test(
            contents,
          )
        )
          throw new Error(`Lab-only implementation unexpectedly bundled into Web: ${path}`)
      }
    }
  }
}
await inspect(root)
for (const m of vocalManifests) await verifyVocalAssets(new URL(`${m.publicPath}/`, root), m)
await verifyWhisperAssets(new URL(`${manifest.publicPath}/`, root))
for (const path of ['index.html', 'experiments/stt/index.html', 'experiments/vocal/index.html']) {
  const html = await readFile(new URL(path, root), 'utf8')
  if (!html.includes("connect-src 'self';") || /connect-src[^;]*https?:/.test(html))
    throw new Error(`External runtime connections allowed by ${path}`)
}
const metadata = JSON.parse(
  await readFile(new URL('models/classifier-v3/metadata.json', root), 'utf8'),
)
for (const key of ['training', 'splitting', 'history', 'testMetrics', 'dataPreparation']) {
  if (key in metadata) throw new Error(`Training metadata in Web runtime assets: ${key}`)
}
console.log(
  `Web output isolated: ${fileURLToPath(root)} contains the product application and approved shared inference assets, without Lab-only tools or training data.`,
)
