import { manifest, verifyWhisperAssets } from './whisper-assets.mjs'
console.log(
  `Whisper ${manifest.revision}: ${await verifyWhisperAssets()} verified bytes, same-origin assets ready.`,
)
