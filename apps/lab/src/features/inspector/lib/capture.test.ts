import { expect, it, vi } from 'vitest'
import { captureReady, captureSnapshot } from './capture'
import { classifier, frame } from '../../comparison/test/fixtures'
import { featureNames } from '../../dataset/lib/featureSchema'

it('captures one canonical vector with rule scores and no raw footage, without a model', async () => {
  const current = frame(1000)
  current.blendshapes.reverse()
  const snapshot = await captureSnapshot(current, 'angry', ' clenched teeth ', null, 1100)
  expect(snapshot.features).toEqual(
    featureNames.map((name) => (name.startsWith('mouthSmile') ? 0.8 : 0)),
  )
  expect(snapshot.label).toBe('angry')
  expect(snapshot.rule.expression.label).toBe('Smile') // Intended label never overwrites prediction.
  expect(snapshot.rule.scores.Smile).toBeGreaterThan(0.5)
  expect(snapshot.description).toBe('clenched teeth')
  expect(snapshot.neural).toEqual({ status: 'unavailable', reason: 'No neural model loaded.' })
  expect(snapshot.modelInfo.sha256).toHaveLength(64)
  expect('image' in snapshot || 'video' in snapshot).toBe(false)
})
it('freezes features before asynchronous neural prediction and uses the exact rule vector', async () => {
  let resolve!: (values: number[]) => void
  const predict = vi.fn(
    () =>
      new Promise<number[]>((done) => {
        resolve = done
      }),
  )
  const current = frame(1000)
  const capturing = captureSnapshot(current, 'smile', '', classifier(predict), 1100)
  const received = predict.mock.calls[0] as unknown as [number[]]
  const original = [...received[0]]
  current.blendshapes.forEach((row) => {
    row.score = 0
  })
  resolve([0.1, 0.7, 0.1, 0.1])
  const snapshot = await capturing
  expect(snapshot.features).toEqual(original)
  expect(snapshot.rule.expression.label).toBe('Smile')
  expect(snapshot.neural.status === 'available' && snapshot.neural.prediction.label).toBe('smile')
  expect(predict).toHaveBeenCalledOnce()
})
it('rejects stale, future, missing, multiple-face or incomplete frames', async () => {
  const valid = frame(1000)
  for (const invalid of [
    { ...valid, faceCount: 0 },
    { ...valid, faceCount: 2 },
    { ...valid, faceDetected: false },
    { ...valid, timestampMs: null },
    { ...valid, timestampMs: 1600 },
    { ...valid, timestampMs: 0 },
    { ...valid, blendshapes: valid.blendshapes.slice(1) },
  ]) {
    expect(captureReady(invalid, 1100)).toBe(false)
    await expect(captureSnapshot(invalid, 'neutral', '', null, 1100)).rejects.toThrow(
      'one valid face',
    )
  }
})
it('preserves a diagnostic snapshot with an explicit neural error instead of inventing probabilities', async () => {
  const snapshot = await captureSnapshot(
    frame(1000),
    'smile',
    '',
    classifier(async () => {
      throw new Error('Model unavailable')
    }),
    1100,
  )
  expect(snapshot.neural).toEqual({ status: 'unavailable', reason: 'Model unavailable' })
  const next = await captureSnapshot(frame(1000), 'smile', '', null, 1100)
  expect(snapshot.id).not.toBe(next.id)
})
