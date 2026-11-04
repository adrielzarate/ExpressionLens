import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as tf from '@tensorflow/tfjs'
import { afterEach, expect, it, vi } from 'vitest'
import {
  canonicalFeatures,
  featureNames,
  inferExpression,
  loadDefaultClassifier,
  mapProbabilities,
  runtimeAssetUrls,
  UNCERTAINTY_MARGIN_THRESHOLD,
} from './index'
import { classifierAssetEntries } from '../vite.mjs'

const directory = pathToFileURL(resolve('models/v3') + '/')
afterEach(() => vi.unstubAllGlobals())
it('resolves runtime paths beneath either app base and preserves the 52-feature order and uncertainty contract', () => {
  expect(runtimeAssetUrls('/product/').model).toBe('/product/models/classifier-v3/model.json')
  expect(runtimeAssetUrls('/lab/').landmarker).toBe('/lab/models/face_landmarker.task')
  expect(
    canonicalFeatures(featureNames.map((name, i) => ({ name, score: i / 100 })).reverse()),
  ).toEqual(featureNames.map((_, i) => i / 100))
  expect(UNCERTAINTY_MARGIN_THRESHOLD).toBe(0.15)
  expect(
    mapProbabilities([0.55, 0.008, 0.002, 0.44], ['neutral', 'smile', 'surprise', 'angry']),
  ).toMatchObject({ rawLabel: 'neutral', label: 'uncertain', isUncertain: true, confidence: 0.55 })
})
it('keeps original v3 artifacts byte-identical and excludes training records from runtime assets', async () => {
  const checksums = JSON.parse(readFileSync(new URL('checksums.json', directory), 'utf8'))
  for (const [name, expected] of Object.entries(checksums)) {
    expect(
      createHash('sha256')
        .update(readFileSync(new URL(name, directory)))
        .digest('hex'),
    ).toBe(expected)
  }
  const assets = await classifierAssetEntries()
  expect(assets.get('models/classifier-v3/weights.bin')).toEqual(
    readFileSync(new URL('weights.bin', directory)),
  )
  const metadata = JSON.parse(assets.get('models/classifier-v3/metadata.json')!.toString())
  for (const key of ['training', 'splitting', 'history', 'testMetrics', 'dataPreparation'])
    expect(key in metadata).toBe(false)
  expect(metadata.featureSchema.featureNames).toEqual([...featureNames])
  expect([...assets.keys()].some((name) => /dataset|references|training/.test(name))).toBe(false)
})
it('loads the real frozen v3 through the shared asset loader and matches direct TensorFlow inference without leaking tensors', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const before = tf.memory().numTensors
  // jsdom lacks Blob.text, while browser FileReader and production File.text work.
  vi.stubGlobal(
    'File',
    class extends File {
      text(): Promise<string> {
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsText(this)
        })
      }
    },
  )
  const assets = await classifierAssetEntries()
  const fetchAsset = vi.fn(async (url: string) => {
    const bytes = assets.get(url.replace('/product/', ''))
    return {
      ok: !!bytes,
      status: bytes ? 200 : 404,
      blob: async () => new Blob([new Uint8Array(bytes!).buffer]),
    }
  })
  vi.stubGlobal('fetch', fetchAsset)
  const json = JSON.parse(readFileSync(new URL('model.json', directory), 'utf8'))
  const baseline = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights,
      weightData: new Uint8Array(readFileSync(new URL('weights.bin', directory))).buffer,
    }),
  )
  const classifier = await loadDefaultClassifier('/product/')
  try {
    for (const activation of [0, 0.1, 0.5, 1]) {
      const features = Array<number>(52).fill(activation)
      const expected = tf.tidy(() =>
        Array.from((baseline.predict(tf.tensor2d([features])) as tf.Tensor).dataSync()),
      )
      const result = await inferExpression(
        classifier,
        featureNames.map((name, i) => ({ name, score: features[i] })).reverse(),
      )
      result.distribution.forEach((row, i) => expect(row.probability).toBeCloseTo(expected[i], 7))
    }
    expect(fetchAsset.mock.calls.map(([url]) => url)).toEqual([
      '/product/models/classifier-v3/model.json',
      '/product/models/classifier-v3/weights.bin',
      '/product/models/classifier-v3/metadata.json',
    ])
  } finally {
    classifier.dispose()
    baseline.dispose()
  }
  expect(tf.memory().numTensors).toBe(before)
})
