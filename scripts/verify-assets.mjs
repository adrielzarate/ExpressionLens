import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = new URL('../', import.meta.url)
const bytes = await readFile(new URL('packages/classifier/models/face_landmarker.task', root))
const expected = (
  await readFile(new URL('packages/classifier/models/face_landmarker.sha256', root), 'utf8')
)
  .trim()
  .split(/\s/)[0]
if (createHash('sha256').update(bytes).digest('hex') !== expected)
  throw new Error('Model checksum mismatch')
const files = await readdir(new URL('node_modules/@mediapipe/tasks-vision/wasm/', root))
for (const name of files) {
  const source = await readFile(new URL(`node_modules/@mediapipe/tasks-vision/wasm/${name}`, root))
  const target = await readFile(new URL(`packages/classifier/.generated/wasm/${name}`, root))
  if (!source.equals(target)) throw new Error(`WASM version mismatch: ${name}`)
}
console.log('Local model checksum and version-matched WASM verified.')

const v3Checksums = JSON.parse(
  await readFile(new URL('packages/classifier/models/v3/checksums.json', root), 'utf8'),
)
for (const [name, sha256] of Object.entries(v3Checksums)) {
  const bytes = await readFile(new URL(`packages/classifier/models/v3/${name}`, root))
  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    throw new Error(`Trained v3 artifact changed: ${name}`)
}
console.log('Frozen v3 model, weights and original training metadata verified.')
