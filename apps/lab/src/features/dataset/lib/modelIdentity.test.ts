/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { faceModelInfo } from '../../../lib/mediapipe'

it('exports the identifier of the actual local model asset, not an invented SDK version', () => {
  const model = readFileSync('../../packages/classifier/models/face_landmarker.task')
  expect(createHash('sha256').update(model).digest('hex')).toBe(faceModelInfo.sha256)
  expect(faceModelInfo.version).toBe('face_landmarker/float16/1')
})
it('restricts runtime connections to the application origin, blocking SDK telemetry', () => {
  const html = readFileSync('index.html', 'utf8')
  expect(html).toContain('http-equiv="Content-Security-Policy"')
  expect(html).toContain("connect-src 'self';")
  expect(html).not.toContain('https://odml.pa.googleapis.com')
})
