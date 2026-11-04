import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { createFaceLandmarker } from '../../../lib/mediapipe'
import { createImageExtractor } from './imageFeatureExtraction'
import { featureNames } from './featureSchema'

vi.mock('../../../lib/mediapipe', () => ({ createFaceLandmarker: vi.fn() }))
const create = vi.mocked(createFaceLandmarker)
const detect = vi.fn()
const close = vi.fn()
const decode = vi.fn()
const revoke = vi.fn()
const drawImage = vi.fn()

beforeEach(() => {
  create.mockReset()
  detect.mockReset()
  close.mockReset()
  decode.mockReset()
  revoke.mockReset()
  class LocalImage {
    src = ''
    naturalWidth = 640
    naturalHeight = 480
    decode = decode
  }
  vi.stubGlobal('Image', LocalImage)
  const BrowserURL = URL
  class LocalURL extends BrowserURL {
    static createObjectURL = vi.fn(() => 'blob:test')
    static revokeObjectURL = revoke
  }
  vi.stubGlobal('URL', LocalURL)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>)
  decode.mockResolvedValue(undefined)
  detect.mockReturnValue({
    faceLandmarks: [[]],
    faceBlendshapes: [
      {
        categories: featureNames
          .map((categoryName, index) => ({ categoryName, score: index / 100 }))
          .reverse(),
      },
    ],
  })
  create.mockResolvedValue({ detect, close } as unknown as FaceLandmarker)
})
afterEach(() => vi.unstubAllGlobals())
const file = () => new File(['encoded-test-image'], 'person.png', { type: 'image/png' })

describe('local image extraction lifecycle', () => {
  it('lazily creates one separate IMAGE model, canonicalizes output, and revokes every image URL', async () => {
    const worker = createImageExtractor()
    expect(create).not.toHaveBeenCalled()
    expect(await worker.extract(file())).toEqual(featureNames.map((_, index) => index / 100))
    await worker.extract(file())
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith({ runningMode: 'IMAGE', numFaces: 2 })
    expect(revoke).toHaveBeenCalledTimes(2)
    worker.dispose()
    expect(close).toHaveBeenCalledOnce()
  })
  it.each([0, 2])('rejects %s detected faces and releases the decoded image', async (count) => {
    detect.mockReturnValue({
      faceLandmarks: Array.from({ length: count }, () => []),
      faceBlendshapes: [],
    })
    const worker = createImageExtractor()
    await expect(worker.extract(file())).rejects.toThrow(count === 0 ? 'No face' : 'Multiple faces')
    expect(revoke).toHaveBeenCalledOnce()
    worker.dispose()
  })
  it('handles decode failures and unsupported files without leaking resources', async () => {
    const worker = createImageExtractor()
    await expect(
      worker.extract(new File(['x'], 'video.mp4', { type: 'video/mp4' })),
    ).rejects.toThrow('Unsupported')
    expect(create).not.toHaveBeenCalled()
    decode.mockRejectedValue(new Error('Corrupt image'))
    await expect(worker.extract(file())).rejects.toThrow('could not be decoded')
    expect(revoke).toHaveBeenCalledOnce()
    worker.dispose()
  })
  it('closes a model that initializes after cancellation and does not decode an image', async () => {
    let resolve!: (value: FaceLandmarker) => void
    create.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const worker = createImageExtractor()
    const pending = worker.extract(file())
    const outcome = expect(pending).rejects.toThrow('cancelled')
    worker.dispose()
    resolve({ detect, close } as unknown as FaceLandmarker)
    await outcome
    expect(close).toHaveBeenCalledOnce()
    expect(decode).not.toHaveBeenCalled()
  })
})
