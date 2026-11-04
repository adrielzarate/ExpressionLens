import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
await mkdir(new URL('packages/classifier/.generated/wasm/', root), { recursive: true })
await cp(
  new URL('node_modules/@mediapipe/tasks-vision/wasm/', root),
  new URL('packages/classifier/.generated/wasm/', root),
  { recursive: true },
)
console.log(
  `MediaPipe WASM copied to ${fileURLToPath(new URL('packages/classifier/.generated/wasm/', root))}`,
)
