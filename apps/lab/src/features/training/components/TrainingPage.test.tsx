import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TrainingPage } from './TrainingPage'
import { datasetStorage } from '../../dataset/lib/datasetStorage'
import { useTraining } from '../hooks/useTraining'
import { trainingDataset } from '../test/fixtures'

vi.mock('../../dataset/lib/datasetStorage', () => ({
  datasetStorage: { all: vi.fn(), add: vi.fn(), clear: vi.fn() },
  storageError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock('../hooks/useTraining', () => ({ useTraining: vi.fn() }))
const start = vi.fn(),
  reset = vi.fn()
beforeEach(() => {
  start.mockReset()
  reset.mockReset()
  vi.mocked(useTraining).mockReturnValue({
    status: 'idle',
    history: [],
    result: null,
    error: null,
    start,
    reset,
    cancel: vi.fn(),
  })
})
afterEach(cleanup)
it('previews the IndexedDB split and starts training without modifying the source dataset', async () => {
  const data = trainingDataset()
  const before = structuredClone(data.samples)
  vi.mocked(datasetStorage.all).mockResolvedValue(data.samples)
  render(<TrainingPage onBusyChange={vi.fn()} />)
  await screen.findByText('Actual sample counts per split and class')
  const button = screen.getByRole('button', { name: 'Start training' }) as HTMLButtonElement
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ seed: 42 }), {
    seed: 42,
    learningRate: 0.001,
    batchSize: 16,
    maxEpochs: 100,
    patience: 10,
  })
  expect(data.samples).toEqual(before)
  expect(datasetStorage.add).not.toHaveBeenCalled()
  expect(datasetStorage.clear).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Random seed'), { target: { value: '' } })
  expect(screen.getByRole('alert').textContent).toContain('Seed')
  expect(button.disabled).toBe(true)
})
it('can train from JSON even with an empty local dataset, without importing it into IndexedDB', async () => {
  vi.mocked(datasetStorage.all).mockResolvedValue([])
  render(<TrainingPage onBusyChange={vi.fn()} />)
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Use dataset JSON' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  const file = new File(['dataset'], 'synthetic.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(trainingDataset(6)) })
  fireEvent.change(screen.getByLabelText('Training dataset JSON'), { target: { files: [file] } })
  await screen.findByText(/Input: synthetic.json/)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(
    (screen.getByRole('button', { name: 'Start training' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  expect(datasetStorage.add).not.toHaveBeenCalled()
})
