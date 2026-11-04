import { runtimeAssetUrls } from './assets'
import { loadClassifier } from './loadClassifier'
import { canonicalFeatures } from './featureSchema'
import { mapProbabilities } from './probabilities'
import type { Blendshape, LoadedClassifier } from './types'

export async function loadDefaultClassifier(
  base = import.meta.env.BASE_URL,
): Promise<LoadedClassifier> {
  const urls = runtimeAssetUrls(base)
  const responses = await Promise.all(
    [urls.model, urls.weights, urls.metadata].map(async (url) => {
      const response = await fetch(url)
      if (!response.ok)
        throw new Error(`Cannot load classifier asset ${url}: HTTP ${response.status}`)
      return response
    }),
  )
  const blobs = await Promise.all(responses.map((response) => response.blob()))
  return loadClassifier({
    model: new File([blobs[0]], 'model.json', { type: 'application/json' }),
    weights: [new File([blobs[1]], 'weights.bin')],
    metadata: new File([blobs[2]], 'metadata.json', { type: 'application/json' }),
  })
}
export async function inferExpression(
  classifier: LoadedClassifier,
  blendshapes: readonly Blendshape[],
) {
  const values = await classifier.predict(canonicalFeatures(blendshapes))
  return mapProbabilities(values, classifier.metadata.labelOrder)
}
