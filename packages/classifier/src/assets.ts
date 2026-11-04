// Vite supplies BASE_URL in each consuming app, including non-root deployments.
export function runtimeAssetUrls(base = import.meta.env.BASE_URL) {
  const root = `${base.replace(/\/$/, '')}/`
  return {
    wasm: `${root}wasm`,
    landmarker: `${root}models/face_landmarker.task`,
    model: `${root}models/classifier-v3/model.json`,
    weights: `${root}models/classifier-v3/weights.bin`,
    metadata: `${root}models/classifier-v3/metadata.json`,
  }
}
