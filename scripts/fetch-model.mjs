import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Official versioned Google model bundle, downloaded at setup time only.
const url =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const directory = new URL('../packages/classifier/models/', import.meta.url)
const model = new URL('face_landmarker.task', directory)
const checksum = new URL('face_landmarker.sha256', directory)
await mkdir(directory, { recursive: true })
let bytes
try {
  bytes = await readFile(model)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (!bytes) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`)
  bytes = Buffer.from(await response.arrayBuffer())
}
const digest = createHash('sha256').update(bytes).digest('hex')
let expected
try {
  expected = (await readFile(checksum, 'utf8')).trim().split(/\s/)[0]
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (expected && digest !== expected)
  throw new Error('Model checksum mismatch. Restore the expected official model bundle.')
await writeFile(model, bytes)
if (!expected) await writeFile(checksum, `${digest}  face_landmarker.task\n`)
console.log(`Official Face Landmarker v1 ready (SHA-256 ${digest})`)
