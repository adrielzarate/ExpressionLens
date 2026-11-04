// Build/development only. Runtime code never imports this script or contacts HF.
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifest, modelRoot, checkWhisperAsset, verifyWhisperAssets } from './whisper-assets.mjs'
for (const entry of manifest.files) {
  const destination = new URL(entry.path, modelRoot)
  try {
    checkWhisperAsset(await readFile(destination), entry)
    console.log(`Verified ${entry.path}`)
    continue
  } catch {
    /* Download a missing/corrupt asset atomically; never accept an LFS pointer or HTML page. */
  }
  const url = `https://huggingface.co/${manifest.modelId}/resolve/${manifest.revision}/${entry.path}`
  console.log(`Downloading ${entry.path} (${entry.bytes} bytes)`)
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok)
    throw new Error(`Whisper download failed: ${entry.path}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  checkWhisperAsset(bytes, entry)
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true })
  const temporary = new URL(`${entry.path}.partial`, modelRoot)
  try {
    await writeFile(temporary, bytes)
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}
console.log(
  `Whisper ${manifest.revision}: ${await verifyWhisperAssets()} verified bytes, ${manifest.files.length} files.`,
)
