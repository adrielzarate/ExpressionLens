import { expect, it } from 'vitest'
import { captureSnapshot } from './capture'
import { frame, classifier } from '../../comparison/test/fixtures'
import { mergeSnapshots, parseInspectorJSON, serializeSnapshots } from './serialization'

const fixture = async () =>
  JSON.parse(
    serializeSnapshots([
      await captureSnapshot(frame(1000), 'smile', 'teeth showing', classifier(), 1100),
    ]),
  )
it('round-trips inspector data and keeps it distinct from training exports', async () => {
  const snapshot = await captureSnapshot(frame(1000), 'smile', 'teeth showing', classifier(), 1100)
  expect(parseInspectorJSON(serializeSnapshots([snapshot]))).toEqual([snapshot])
  expect(() => parseInspectorJSON(JSON.stringify({ schemaVersion: 1, samples: [] }))).toThrow(
    'inspector export',
  )
})
it('validates schema, exact feature ordering, vectors, labels, IDs, timestamps and predictions', async () => {
  const original = await fixture()
  const mutations: ((data: typeof original) => void)[] = [
    (d) => {
      d.schemaVersion = 2
    },
    (d) => {
      d.featureSchema.featureNames.reverse()
    },
    (d) => {
      d.featureSchema.featureNames.pop()
    },
    (d) => {
      d.snapshots[0].features[0] = null
    },
    (d) => {
      d.snapshots[0].features[0] = 1.1
    },
    (d) => {
      d.snapshots[0].features.pop()
    },
    (d) => {
      d.snapshots[0].label = 'frown'
    },
    (d) => {
      d.snapshots[0].id = ''
    },
    (d) => {
      d.snapshots.push(d.snapshots[0])
    },
    (d) => {
      d.snapshots[0].timestamp = 'yesterday'
    },
    (d) => {
      d.snapshots[0].modelInfo.sha256 = 'unknown'
    },
    (d) => {
      d.snapshots[0].rule.scores.Angry = -1
    },
    (d) => {
      d.snapshots[0].rule.thresholds.smileMin = 2
    },
    (d) => {
      d.snapshots[0].neural.prediction.distribution.reverse()
    },
    (d) => {
      d.snapshots[0].neural.prediction.distribution[0].probability = 1
    },
    (d) => {
      d.snapshots[0].neural.prediction.label = 'angry'
    },
    (d) => {
      d.snapshots[0].neural.prediction.confidence = 0.2
    },
  ]
  for (const mutate of mutations) {
    const data = structuredClone(original)
    mutate(data)
    expect(() => parseInspectorJSON(JSON.stringify(data))).toThrow()
  }
})
it('validates unavailable predictions, strips unknown payloads and rejects collisions when merging', async () => {
  const data = await fixture()
  data.snapshots[0].neural = { status: 'unavailable', reason: 'No model loaded.' }
  data.snapshots[0].image = 'unwanted payload'
  const rows = parseInspectorJSON(JSON.stringify(data))
  expect(rows[0].neural.status).toBe('unavailable')
  expect('image' in rows[0]).toBe(false)
  expect(mergeSnapshots([], rows)).toEqual(rows)
  expect(() => mergeSnapshots(rows, rows)).toThrow('already exist')
  data.snapshots[0].neural.reason = ''
  expect(() => parseInspectorJSON(JSON.stringify(data))).toThrow()
})

it('preserves raw and uncertain predictions through snapshot export/import', async () => {
  const snapshot = await captureSnapshot(
    frame(1000),
    'angry',
    '',
    classifier(async () => [0.55, 0.008, 0.002, 0.44]),
    1100,
  )
  const [restored] = parseInspectorJSON(serializeSnapshots([snapshot]))
  expect(restored).toEqual(snapshot)
  expect(restored.neural.status === 'available' && restored.neural.prediction).toMatchObject({
    rawLabel: 'neutral',
    label: 'uncertain',
    confidence: 0.55,
    isUncertain: true,
  })
})
it('upgrades old four-class snapshot predictions using the original probabilities', async () => {
  const data = await fixture()
  const prediction = data.snapshots[0].neural.prediction
  prediction.distribution = [0.55, 0.008, 0.002, 0.44].map((probability, i) => ({
    label: ['neutral', 'smile', 'surprise', 'angry'][i],
    probability,
  }))
  prediction.label = 'neutral'
  prediction.confidence = 0.55
  delete prediction.rawLabel
  delete prediction.margin
  delete prediction.isUncertain
  const [restored] = parseInspectorJSON(JSON.stringify(data))
  expect(restored.neural.status === 'available' && restored.neural.prediction).toMatchObject({
    rawLabel: 'neutral',
    label: 'uncertain',
    isUncertain: true,
  })
  expect(restored.neural.status === 'available' && restored.neural.prediction.distribution).toEqual(
    prediction.distribution,
  )
  prediction.distribution = [0.8, 0.01, 0.01, 0.18].map((probability, i) => ({
    ...prediction.distribution[i],
    probability,
  }))
  prediction.confidence = 0.8
  const [clear] = parseInspectorJSON(JSON.stringify(data))
  expect(clear.neural.status === 'available' && clear.neural.prediction).toMatchObject({
    rawLabel: 'neutral',
    label: 'neutral',
    isUncertain: false,
  })
})
it('rejects inconsistent or partially supplied uncertainty metadata', async () => {
  for (const mutation of [
    (p: Record<string, unknown>) => {
      p.rawLabel = 'angry'
    },
    (p: Record<string, unknown>) => {
      p.margin = 0.01
    },
    (p: Record<string, unknown>) => {
      p.isUncertain = true
    },
    (p: Record<string, unknown>) => {
      delete p.margin
    },
  ]) {
    const data = await fixture()
    mutation(data.snapshots[0].neural.prediction)
    expect(() => parseInspectorJSON(JSON.stringify(data))).toThrow('Inconsistent neural prediction')
  }
})
