import { validateSample } from '../../dataset/lib/datasetValidation'
import { splitNames, trainingLabels } from '../types/training'
import type { PreparedDataset } from '../types/training'

export function assertTrainingSplits(data: PreparedDataset): void {
  const ids = new Set<string>()
  const vectors = new Set<string>()
  const participants = new Map<string, string>()
  for (const split of splitNames) {
    const rows = data.splits[split]
    if (!rows.length) throw new Error('Training, validation and test sets must be non-empty.')
    const labels = new Set<string>()
    for (const row of rows) {
      const valid = validateSample(row)
      if (valid.label !== row.label) throw new Error('Normalize legacy labels before training.')
      if (ids.has(row.id)) throw new Error('A sample ID occurs in multiple training splits.')
      ids.add(row.id)
      const previous = participants.get(row.participantId)
      if (previous && previous !== split)
        throw new Error('Participant leakage between training splits.')
      participants.set(row.participantId, split)
      const key = JSON.stringify(row.features)
      if (vectors.has(key))
        throw new Error('Exact duplicate vectors remain in the training splits.')
      vectors.add(key)
      labels.add(row.label)
    }
    if (trainingLabels.some((label) => !labels.has(label)))
      throw new Error(`Every class must be present in the ${split} split.`)
  }
}
