import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { createFaceLandmarker } from '../../../lib/mediapipe'
import { canonicalFeatures } from './featureSchema'

export const imageAccept = 'image/jpeg,image/png,image/webp'
const supportedTypes = new Set(imageAccept.split(','))

export function createImageExtractor() {
  let instance: FaceLandmarker | null = null
  let pending: Promise<FaceLandmarker> | null = null
  let disposed = false
  async function getModel() {
    if (disposed) throw new Error('Image processing was cancelled.')
    if (!pending) {
      pending = createFaceLandmarker({ runningMode: 'IMAGE', numFaces: 2 })
        .then((model) => {
          if (disposed) {
            model.close()
            throw new Error('Image processing was cancelled.')
          }
          instance = model
          return model
        })
        .catch((error: unknown) => {
          pending = null
          throw error
        })
    }
    return pending
  }
  return {
    async extract(file: File): Promise<number[]> {
      if (!supportedTypes.has(file.type))
        throw new Error('Unsupported image. Choose JPEG, PNG, or WebP.')
      if (file.size > 30 * 1024 * 1024) throw new Error('Image exceeds the 30 MB per-file limit.')
      const model = await getModel()
      if (disposed) throw new Error('Image processing was cancelled.')
      const url = URL.createObjectURL(file)
      const image = new Image()
      try {
        image.src = url
        try {
          await image.decode()
        } catch {
          throw new Error('The image could not be decoded.')
        }
        if (disposed) throw new Error('Image processing was cancelled.')
        if (
          !image.naturalWidth ||
          !image.naturalHeight ||
          image.naturalWidth * image.naturalHeight > 25_000_000
        )
          throw new Error('Image dimensions are invalid or exceed 25 megapixels.')
        // Limit the inference input; decode and process only one image at a time.
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        try {
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Image processing is not supported by this browser.')
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          const result = model.detect(canvas)
          if (result.faceLandmarks.length === 0) throw new Error('No face detected.')
          if (result.faceLandmarks.length !== 1)
            throw new Error('Multiple faces detected. Use an image containing one person.')
          return canonicalFeatures(
            (result.faceBlendshapes[0]?.categories ?? []).map(({ categoryName, score }) => ({
              name: categoryName,
              score,
            })),
          )
        } finally {
          canvas.width = 0
          canvas.height = 0
        }
      } finally {
        image.src = ''
        URL.revokeObjectURL(url)
      }
    },
    dispose() {
      disposed = true
      instance?.close()
      instance = null
    },
  }
}
