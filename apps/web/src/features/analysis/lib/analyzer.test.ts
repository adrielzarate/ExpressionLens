import { expect, it, vi } from 'vitest'
import {
  createFaceLandmarker,
  inferExpression,
  loadDefaultClassifier,
  mapProbabilities,
} from '@expressionlens/classifier'
import { createAnalyzer } from './analyzer'

vi.mock('@expressionlens/classifier', async (original) => ({
  ...(await original<typeof import('@expressionlens/classifier')>()),
  createFaceLandmarker: vi.fn(),
  inferExpression: vi.fn(),
  loadDefaultClassifier: vi.fn(),
}))
function setup() {
  const face = { detectForVideo: vi.fn(), close: vi.fn() },
    network = { dispose: vi.fn() }
  vi.mocked(createFaceLandmarker).mockResolvedValue(
    face as unknown as Awaited<ReturnType<typeof createFaceLandmarker>>,
  )
  vi.mocked(loadDefaultClassifier).mockResolvedValue(
    network as unknown as Awaited<ReturnType<typeof loadDefaultClassifier>>,
  )
  return { face, network }
}
it('uses the shared single-face contract, original timestamps and uncertainty interpretation', async () => {
  const { face, network } = setup()
  const prediction = mapProbabilities(
    [0.55, 0.008, 0.002, 0.44],
    ['neutral', 'smile', 'surprise', 'angry'],
  )
  vi.mocked(inferExpression).mockResolvedValue(prediction)
  face.detectForVideo
    .mockReturnValueOnce({ faceLandmarks: [], faceBlendshapes: [] })
    .mockReturnValueOnce({ faceLandmarks: [[], []], faceBlendshapes: [] })
    .mockReturnValue({
      faceLandmarks: [[]],
      faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.2 }] }],
    })
  const analyzer = await createAnalyzer(new AbortController().signal),
    video = document.createElement('video')
  expect(await analyzer.analyze(video, 0)).toEqual({ status: 'no-face', timestampMs: 0 })
  expect(await analyzer.analyze(video, 200)).toEqual({ status: 'multiple-faces', timestampMs: 200 })
  expect(inferExpression).not.toHaveBeenCalled()
  expect(await analyzer.analyze(video, 400)).toEqual({
    status: 'detected',
    timestampMs: 400,
    ...prediction,
  })
  expect(inferExpression).toHaveBeenCalledWith(network, [{ name: 'jawOpen', score: 0.2 }])
  expect(face.detectForVideo).toHaveBeenLastCalledWith(video, 400)
  expect(createFaceLandmarker).toHaveBeenCalledWith({ runningMode: 'VIDEO', numFaces: 2 })
  analyzer.dispose()
  expect(face.close).toHaveBeenCalledOnce()
  expect(network.dispose).toHaveBeenCalledOnce()
})
it('closes MediaPipe after model loading fails', async () => {
  const { face } = setup()
  vi.mocked(loadDefaultClassifier).mockRejectedValueOnce(new Error('missing weights'))
  await expect(createAnalyzer(new AbortController().signal)).rejects.toThrow('classifier v3')
  expect(face.close).toHaveBeenCalledOnce()
})
it('disposes initialization that finishes after cancellation', async () => {
  const { face, network } = setup(),
    controller = new AbortController()
  vi.mocked(loadDefaultClassifier).mockImplementationOnce(async () => {
    controller.abort()
    return network as unknown as Awaited<ReturnType<typeof loadDefaultClassifier>>
  })
  await expect(createAnalyzer(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(face.close).toHaveBeenCalledOnce()
  expect(network.dispose).toHaveBeenCalledOnce()
})
