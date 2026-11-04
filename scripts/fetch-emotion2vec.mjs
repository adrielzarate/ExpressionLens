// Development-time only. No remote URLs are imported by browser runtime code.
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkVocalAsset } from './vocal-assets.mjs'
const manifest = JSON.parse(
  await readFile(
    new URL('../apps/web/src/experiments/vocal/emotion2vec-assets.json', import.meta.url),
    'utf8',
  ),
)
const root = new URL(`../apps/web/public/${manifest.publicPath}/`, import.meta.url)
for (const file of manifest.files) {
  const target = new URL(file.path, root)
  try {
    checkVocalAsset(await readFile(target), file)
    console.log(`Verified ${file.path}`)
    continue
  } catch {
    /* Restore pinned assets. */
  }
  console.log(`Downloading ${file.path} (${file.bytes} bytes)`)
  const response = await fetch(
    `https://huggingface.co/${manifest.modelId}/resolve/${manifest.revision}/${file.path}`,
    { signal: AbortSignal.timeout(300000) },
  )
  if (!response.ok) throw new Error(`Emotion2vec download HTTP ${response.status}: ${file.path}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  checkVocalAsset(bytes, file)
  await mkdir(dirname(fileURLToPath(target)), { recursive: true })
  const partial = new URL(`${file.path}.partial`, root)
  try {
    await writeFile(partial, bytes)
    await rename(partial, target)
  } finally {
    await rm(partial, { force: true })
  }
}
console.log(
  `Emotion2vec ${manifest.revision}: ${manifest.files.reduce((sum, file) => sum + file.bytes, 0)} verified bytes.`,
)
