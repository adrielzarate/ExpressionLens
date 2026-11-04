import { trainingLabels, splitNames, splitRatios } from '../types/training'
import type { PreparedDataset, SplitSummary } from '../types/training'
import type { FacialExpressionSample } from '../../dataset/types/dataset'
import { compareIds, seededRandom, shuffled, validateSeed } from './random'

interface Group {
  participantId: string
  samples: FacialExpressionSample[]
  counts: number[]
}
export function summarizeSplit(rows: readonly FacialExpressionSample[]): SplitSummary {
  return {
    samples: rows.length,
    participants: new Set(rows.map((row) => row.participantId)).size,
    perClass: trainingLabels.map((label) => rows.filter((row) => row.label === label).length),
    synthetic: rows.filter((row) => row.source === 'synthetic').length,
    real: rows.filter((row) => row.source === 'real').length,
  }
}

// Deterministic grouped stratification. Whole participant groups are indivisible.
// Minimize normalized class/total deviations, with a large penalty for missing
// classes. Multiple seeded starts + improving moves handle mixed-label groups.
export function splitDataset(
  samples: readonly FacialExpressionSample[],
  seed: number,
): Pick<PreparedDataset, 'splits' | 'summary' | 'warnings'> {
  validateSeed(seed)
  const byParticipant = new Map<string, FacialExpressionSample[]>()
  for (const sample of [...samples].sort((a, b) => compareIds(a.id, b.id))) {
    const group = byParticipant.get(sample.participantId) ?? []
    group.push(sample)
    byParticipant.set(sample.participantId, group)
  }
  const groups: Group[] = [...byParticipant]
    .sort(([a], [b]) => compareIds(a, b))
    .map(([participantId, rows]) => ({
      participantId,
      samples: rows,
      counts: summarizeSplit(rows).perClass,
    }))
  const totals = summarizeSplit(samples).perClass
  for (let label = 0; label < 4; label++) {
    const count = groups.filter((group) => group.counts[label] > 0).length
    if (count < 3)
      throw new Error(
        `${trainingLabels[label]} needs samples from at least 3 distinct participants after duplicate removal (found ${count}). Each split must contain every class.`,
      )
  }
  const score = (counts: number[][], sizes: number[]) => {
    let result = 0
    for (let split = 0; split < 3; split++) {
      const sizeTarget = samples.length * splitRatios[split]
      result += (0.5 * (sizes[split] - sizeTarget) ** 2) / Math.max(1, sizeTarget)
      for (let label = 0; label < 4; label++) {
        const target = totals[label] * splitRatios[split]
        result += (counts[split][label] - target) ** 2 / Math.max(1, target)
        if (counts[split][label] === 0) result += 10000
      }
    }
    return result
  }
  let bestScore = Infinity
  let bestAssignments: number[] = []
  for (let attempt = 0; attempt < 16; attempt++) {
    const random = seededRandom((seed + attempt * 7919) >>> 0)
    const counts = Array.from({ length: 3 }, () => [0, 0, 0, 0])
    const sizes = [0, 0, 0]
    const assignments = Array(groups.length).fill(-1) as number[]
    const priority = (group: Group) =>
      Math.max(...group.counts.map((count, label) => count / totals[label]))
    const order = shuffled(
      groups.map((_, index) => index),
      random,
    ).sort(
      (a, b) =>
        priority(groups[b]) - priority(groups[a]) ||
        groups[b].samples.length - groups[a].samples.length,
    )
    const change = (group: Group, split: number, direction: number) => {
      sizes[split] += group.samples.length * direction
      for (let label = 0; label < 4; label++)
        counts[split][label] += group.counts[label] * direction
    }
    for (const index of order) {
      let chosen = 0,
        lowest = Infinity
      for (const split of shuffled([0, 1, 2], random)) {
        change(groups[index], split, 1)
        const candidate = score(counts, sizes)
        change(groups[index], split, -1)
        if (candidate < lowest - 1e-9) {
          lowest = candidate
          chosen = split
        }
      }
      assignments[index] = chosen
      change(groups[index], chosen, 1)
    }
    let current = score(counts, sizes)
    for (let pass = 0; pass < 4; pass++) {
      let improved = false
      for (const index of order) {
        for (const next of [0, 1, 2]) {
          if (next === assignments[index]) continue
          const from = assignments[index]
          change(groups[index], from, -1)
          change(groups[index], next, 1)
          const candidate = score(counts, sizes)
          if (candidate < current - 1e-9) {
            assignments[index] = next
            current = candidate
            improved = true
          } else {
            change(groups[index], next, -1)
            change(groups[index], from, 1)
          }
        }
      }
      if (!improved) break
    }
    if (current < bestScore - 1e-9) {
      bestScore = current
      bestAssignments = [...assignments]
    }
  }
  const splits: PreparedDataset['splits'] = { train: [], validation: [], test: [] }
  groups.forEach((group, index) => {
    splits[splitNames[bestAssignments[index]]].push(...group.samples)
  })
  for (let index = 0; index < 3; index++)
    splits[splitNames[index]] = shuffled(
      splits[splitNames[index]],
      seededRandom((seed + 101 + index) >>> 0),
    )
  const summary = {
    train: summarizeSplit(splits.train),
    validation: summarizeSplit(splits.validation),
    test: summarizeSplit(splits.test),
  }
  if (splitNames.some((name) => summary[name].perClass.some((count) => count === 0)))
    throw new Error(
      'Could not form three participant-disjoint splits containing every class. Collect more independent participants per class.',
    )
  const warnings: string[] = []
  if (
    splitNames.some(
      (name, index) => Math.abs(summary[name].samples / samples.length - splitRatios[index]) > 0.03,
    )
  )
    warnings.push(
      'Whole participant groups prevent exact 70/15/15 sizes. Actual counts are shown below; identities were never split.',
    )
  if (summary.test.perClass.some((count) => count < 5))
    warnings.push(
      'Some test classes have fewer than 5 samples. Their metrics will be especially uncertain.',
    )
  return { splits, summary, warnings }
}
