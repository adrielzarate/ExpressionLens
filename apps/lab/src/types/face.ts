import type { Blendshape } from '@expressionlens/classifier'
export type { Blendshape } from '@expressionlens/classifier'

export type CameraStatus = 'idle' | 'requesting' | 'live' | 'error'
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface FaceSnapshot {
  blendshapes: Blendshape[]
  faceDetected: boolean | null
  faceCount: number
  timestampMs: number | null
  scheduler: 'video-frame' | 'animation-frame' | null
  fps: number
  averageDurationMs: number
}

export const emptySnapshot = (): FaceSnapshot => ({
  blendshapes: [],
  faceDetected: null,
  faceCount: 0,
  timestampMs: null,
  scheduler: null,
  fps: 0,
  averageDurationMs: 0,
})

export interface VideoDiagnostics {
  scheduler: 'video-frame' | 'animation-frame'
  callbacks: number
  inferences: number
  width: number
  height: number
  readyState: number
  paused: boolean
  currentTime: number
  blockedBy: string
}
