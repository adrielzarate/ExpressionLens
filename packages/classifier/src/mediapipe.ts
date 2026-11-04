import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

export const inferenceDelegate = 'CPU / WASM'

export { faceModelInfo } from './modelInfo'
import { runtimeAssetUrls } from './assets'

export async function createFaceLandmarker(
  options: { runningMode: 'VIDEO' | 'IMAGE'; numFaces: 1 | 2 } = {
    runningMode: 'VIDEO',
    numFaces: 1,
  },
): Promise<FaceLandmarker> {
  const assets = runtimeAssetUrls()
  const fileset = await FilesetResolver.forVisionTasks(assets.wasm)
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: assets.landmarker,
      delegate: 'CPU',
    },
    runningMode: options.runningMode,
    numFaces: options.numFaces,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  })
}
