import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
export const vocalManifest = JSON.parse(
  await readFile(new URL('../apps/web/src/features/vocal/assets.json', import.meta.url), 'utf8'),
)
export const emotionManifest = JSON.parse(
  await readFile(
    new URL('../apps/web/src/experiments/vocal/emotion2vec-assets.json', import.meta.url),
    'utf8',
  ),
)
export const vocalManifests = [vocalManifest, emotionManifest]
export const vocalRoot = new URL(`../apps/web/public/${vocalManifest.publicPath}/`, import.meta.url)
export function checkVocalAsset(bytes, file) {
  if (!/^[a-f0-9]{64}$/.test(file.sha256 ?? ''))
    throw new Error(`Missing SER SHA-256: ${file.path}`)
  if (bytes.length !== file.bytes) throw new Error(`SER size mismatch: ${file.path}`)
  if (file.sha256 && createHash('sha256').update(bytes).digest('hex') !== file.sha256)
    throw new Error(`SER SHA-256 mismatch: ${file.path}`)
  if (
    file.gitBlobSha1 &&
    createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !==
      file.gitBlobSha1
  )
    throw new Error(`SER Git blob mismatch: ${file.path}`)
  if (!file.sha256 && !file.gitBlobSha1) throw new Error(`Missing SER checksum: ${file.path}`)
}
export async function verifyVocalAssets(root = vocalRoot, manifest = vocalManifest) {
  let total = 0
  for (const file of manifest.files) {
    let bytes
    try {
      bytes = await readFile(new URL(file.path, root))
    } catch {
      throw new Error(
        `Missing SER asset ${file.path}. Run npm run assets:vocal and npm run assets:emotion2vec.`,
      )
    }
    checkVocalAsset(bytes, file)
    total += bytes.length
  }
  return total
}
async function main() {
  if (process.argv.includes('--download')) {
    for (const file of vocalManifest.files) {
      const destination = new URL(file.path, vocalRoot)
      try {
        checkVocalAsset(await readFile(destination), file)
        continue
      } catch {
        /* Restore only pinned files. */
      }
      console.log(`Downloading SER ${file.path} (${file.bytes} bytes)`)
      let bytes
      if (file.source === 'installed-apache-license') {
        bytes = await readFile(
          new URL('../node_modules/@huggingface/transformers/LICENSE', import.meta.url),
        )
      } else {
        const response = await fetch(
          `https://huggingface.co/${vocalManifest.modelId}/resolve/${vocalManifest.revision}/${file.path}`,
          { signal: AbortSignal.timeout(240_000) },
        )
        if (!response.ok) throw new Error(`SER download HTTP ${response.status}: ${file.path}`)
        bytes = Buffer.from(await response.arrayBuffer())
      }
      checkVocalAsset(bytes, file)
      await mkdir(dirname(fileURLToPath(destination)), { recursive: true })
      const partial = new URL(`${file.path}.partial`, vocalRoot)
      try {
        await writeFile(partial, bytes)
        await rename(partial, destination)
      } finally {
        await rm(partial, { force: true })
      }
    }
  }
  console.log(`SER ${vocalManifest.revision}: ${await verifyVocalAssets()} verified bytes.`)
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
