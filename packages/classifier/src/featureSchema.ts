import type { Blendshape } from './types'
import { faceModelInfo } from './modelInfo'
import type { FeatureMetadata } from './types'

// Explicit schema v1. Keep immutable: changing this order requires a new schema.
// Includes _neutral, as returned by the official 52-category model.
// https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_blendshapes_graph.cc
export const featureNames = [
  '_neutral',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
] as const

export function canonicalFeatures(blendshapes: readonly Blendshape[]): number[] {
  if (blendshapes.length !== featureNames.length)
    throw new Error('Expected exactly 52 blendshapes.')
  const byName = new Map<string, number>()
  for (const { name, score } of blendshapes) {
    if (byName.has(name)) throw new Error(`Duplicate coefficient: ${name}`)
    if (!Number.isFinite(score) || score < 0 || score > 1)
      throw new Error(`Invalid coefficient: ${name}`)
    byName.set(name, score)
  }
  return featureNames.map((name) => {
    const value = byName.get(name)
    if (value === undefined) throw new Error(`Missing coefficient: ${name}`)
    return value
  })
}

export function featureMetadata(): FeatureMetadata {
  return {
    schemaVersion: 1,
    featureSchema: {
      version: 1,
      type: 'mediapipe-face-blendshapes',
      featureNames: [...featureNames],
    },
    modelInfo: { ...faceModelInfo },
  }
}
