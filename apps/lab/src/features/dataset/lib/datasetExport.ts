import { datasetMetadata } from './featureSchema'
import { validateDataset } from './datasetValidation'
import type { FacialExpressionSample } from '../types/dataset'

export function exportDatasetJson(samples: FacialExpressionSample[], now = new Date()): string {
  const dataset = validateDataset({ ...datasetMetadata(), exportedAt: now.toISOString(), samples })
  return JSON.stringify(dataset, null, 2)
}
export function downloadDataset(samples: FacialExpressionSample[]): void {
  const url = URL.createObjectURL(
    new Blob([exportDatasetJson(samples)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `interview-mirror-dataset-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  // Allow browsers, including iOS, to consume the download before revocation.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
