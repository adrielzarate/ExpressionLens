import type { TrainingResult } from '../types/training'
export function downloadTrainingFile(
  result: TrainingResult,
  name: 'model.json' | 'weights.bin' | 'metadata.json',
): void {
  const blob =
    name === 'weights.bin'
      ? new Blob([result.artifacts.weights], { type: 'application/octet-stream' })
      : new Blob([name === 'model.json' ? result.artifacts.modelJson : result.metadataJson], {
          type: 'application/json',
        })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
