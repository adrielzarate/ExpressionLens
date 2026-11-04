import { validateDataset } from '../../dataset/lib/datasetValidation'
import { compareIds } from './random'
import { splitDataset } from './splitDataset'
import type { PreparedDataset, PreparationReport } from '../types/training'
import type { FacialExpressionSample } from '../../dataset/types/dataset'

export function prepareTrainingSamples(value: unknown): {
  samples: FacialExpressionSample[]
  report: PreparationReport
} {
  const dataset = validateDataset(value)
  const groups = new Map<string, FacialExpressionSample[]>()
  for (const sample of [...dataset.samples].sort((a, b) => compareIds(a.id, b.id))) {
    const key = JSON.stringify(sample.features)
    const group = groups.get(key) ?? []
    group.push(sample)
    groups.set(key, group)
  }
  const retained: FacialExpressionSample[] = []
  let duplicateGroups = 0,
    conflictingGroups = 0,
    conflictingSamplesExcluded = 0
  for (const group of groups.values()) {
    if (group.length > 1) duplicateGroups += 1
    if (new Set(group.map((sample) => sample.label)).size > 1) {
      conflictingGroups += 1
      conflictingSamplesExcluded += group.length
    } else retained.push(group[0])
  }
  return {
    samples: retained,
    report: {
      originalSamples: dataset.samples.length,
      usableSamples: retained.length,
      duplicatesExcluded: dataset.samples.length - retained.length,
      duplicateGroups,
      conflictingGroups,
      conflictingSamplesExcluded,
    },
  }
}

export function prepareDataset(value: unknown, seed = 42): PreparedDataset {
  const { samples, report } = prepareTrainingSamples(value)
  return { ...splitDataset(samples, seed), seed, report }
}
