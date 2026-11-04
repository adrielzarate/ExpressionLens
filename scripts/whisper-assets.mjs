import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
export const manifest = JSON.parse(
  await readFile(
    new URL('../apps/web/src/features/speech/whisper-assets.json', import.meta.url),
    'utf8',
  ),
)
export const publicRoot = new URL('../apps/web/public/', import.meta.url)
export const modelRoot = new URL(`${manifest.publicPath}/`, publicRoot)
export function checkWhisperAsset(bytes, entry) {
  if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? ''))
    throw new Error(`Missing pinned Whisper SHA-256: ${entry.path}`)
  if (bytes.length !== entry.bytes) throw new Error(`Whisper size mismatch: ${entry.path}`)
  if (entry.sha256 && createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
    throw new Error(`Whisper SHA-256 mismatch: ${entry.path}`)
  if (
    entry.gitBlobSha1 &&
    createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !==
      entry.gitBlobSha1
  )
    throw new Error(`Whisper Git blob mismatch: ${entry.path}`)
}
export async function verifyWhisperAssets(root = modelRoot) {
  let total = 0
  for (const entry of manifest.files) {
    let bytes
    try {
      bytes = await readFile(new URL(entry.path, root))
    } catch {
      throw new Error(
        `Missing Whisper asset: ${entry.path}. Run npm run assets:whisper before building.`,
      )
    }
    checkWhisperAsset(bytes, entry)
    total += bytes.length
  }
  return total
}
