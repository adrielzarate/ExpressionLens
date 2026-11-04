import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { NeuralPreview } from './NeuralPreview'
import { pair } from '../test/fixtures'
import { mapProbabilities } from '../lib/probabilities'

afterEach(cleanup)
it('shows uncertainty without a definitive class heading and keeps probabilities inspectable', () => {
  const prediction = pair()
  prediction.primary = prediction.raw = mapProbabilities(
    [0.55, 0.008, 0.002, 0.44],
    ['neutral', 'smile', 'surprise', 'angry'],
  )
  render(<NeuralPreview prediction={prediction} state="Waiting" smoothing="disabled" showRaw />)
  expect(screen.getByRole('heading', { name: 'Uncertain' }).className).toContain('neural-uncertain')
  expect(screen.queryByRole('heading', { name: /^(neutral|angry)$/i })).toBeNull()
  expect(screen.getAllByRole('progressbar')).toHaveLength(4)
  expect(screen.getByText(/Top-two margin: 11.0/)).toBeDefined()
  expect(screen.getByText(/Raw frame interpretation: Uncertain.*raw argmax: neutral/)).toBeDefined()
})
it('keeps a clear four-class prediction when the margin is sufficient', () => {
  render(<NeuralPreview prediction={pair()} state="Waiting" smoothing="medium" showRaw={false} />)
  expect(screen.getByRole('heading', { name: 'smile' })).toBeDefined()
})
