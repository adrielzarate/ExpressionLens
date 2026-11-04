import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ExpressionPreview } from './ExpressionPreview'
import type { CameraStatus, ModelStatus } from '../types/face'

afterEach(cleanup)
it.each<[CameraStatus, ModelStatus, boolean | null, string]>([
  ['idle', 'idle', null, 'Camera is off'],
  ['requesting', 'loading', null, 'Waiting for camera'],
  ['live', 'loading', null, 'Loading facial model'],
  ['live', 'ready', null, 'Waiting for video frames'],
  ['live', 'ready', false, 'No face detected'],
  ['live', 'ready', true, 'Waiting for coefficients'],
  ['live', 'error', null, 'Analysis unavailable'],
])('explains camera %s, model %s, face %s', (cameraStatus, modelStatus, faceDetected, title) => {
  render(
    <ExpressionPreview
      cameraStatus={cameraStatus}
      modelStatus={modelStatus}
      faceDetected={faceDetected}
      blendshapes={[]}
    />,
  )
  expect(screen.getByRole('heading', { name: title })).toBeDefined()
})
