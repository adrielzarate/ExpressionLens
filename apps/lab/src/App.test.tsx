import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)
it('preserves the laboratory and exposes the separate local Dataset Collector', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Facial Expression Lab.' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Dataset Collector' }))
  expect(screen.getByRole('heading', { name: 'Dataset Collector.' })).toBeDefined()
  await screen.findByText(/Your dataset is empty/)
  expect(screen.getByRole('button', { name: 'Choose images' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Facial Expression Lab' }))
  expect(screen.getByRole('heading', { name: 'Facial Expression Lab.' })).toBeDefined()
  expect(screen.getByRole('button', { name: /Start Camera/ })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Training' }))
  expect(screen.getByRole('heading', { name: 'Classifier Training.' })).toBeDefined()
  await screen.findByRole('alert')
  expect(
    (screen.getByRole('button', { name: 'Start training' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Blendshape Inspector' }))
  expect(screen.getByRole('heading', { name: 'Blendshape Inspector.' })).toBeDefined()
  expect(
    (screen.getByRole('button', { name: 'Capture snapshot' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})
