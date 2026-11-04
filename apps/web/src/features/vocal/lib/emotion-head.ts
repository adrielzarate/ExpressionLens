export interface EmotionHead {
  labels: string[]
  weight: number[][]
  bias: number[]
}
export function parseHead(value: unknown): EmotionHead {
  const head = value as EmotionHead | null
  if (
    !head ||
    !Array.isArray(head.labels) ||
    head.labels.length !== 9 ||
    head.labels.some((label) => typeof label !== 'string' || !label) ||
    new Set(head.labels).size !== 9 ||
    !Array.isArray(head.weight) ||
    head.weight.length !== 9 ||
    head.weight.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== 768 ||
        row.some((x) => typeof x !== 'number' || !Number.isFinite(x)),
    ) ||
    !Array.isArray(head.bias) ||
    head.bias.length !== 9 ||
    head.bias.some((x) => typeof x !== 'number' || !Number.isFinite(x))
  )
    throw new Error('Invalid Emotion2vec classification head.')
  return head
}
// The ONNX encoder already normalizes raw PCM. Pool its frames, then apply the published head.
export function classifyFeatures(features: Float32Array, frames: number, head: EmotionHead) {
  const width = head.weight[0].length
  if (!Number.isInteger(frames) || frames < 1 || features.length !== frames * width)
    throw new Error('Invalid Emotion2vec feature dimensions.')
  const pooled = new Float64Array(width)
  for (let t = 0; t < frames; t++)
    for (let j = 0; j < width; j++) pooled[j] += features[t * width + j] / frames
  const logits = head.weight.map((row, i) =>
    row.reduce((sum, w, j) => sum + w * pooled[j], head.bias[i]),
  )
  if (logits.some((x) => !Number.isFinite(x))) throw new Error('Non-finite Emotion2vec output.')
  const max = Math.max(...logits),
    exp = logits.map((x) => Math.exp(x - max)),
    sum = exp.reduce((a, b) => a + b, 0)
  return head.labels.map((label, i) => ({ label, score: exp[i] / sum }))
}
