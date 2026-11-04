import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ImageBatchImporter } from './ImageBatchImporter'
import { createImageExtractor } from '../lib/imageFeatureExtraction'
import { datasetStorage } from '../lib/datasetStorage'
import { sample } from '../test/fixtures'

vi.mock('../lib/imageFeatureExtraction', () => ({
  createImageExtractor: vi.fn(),
  imageAccept: 'image/jpeg,image/png,image/webp',
}))
vi.mock('../lib/datasetStorage', () => ({
  datasetStorage: { add: vi.fn() },
  storageError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
const extract = vi.fn()
const add = vi.mocked(datasetStorage.add)
beforeEach(() => {
  extract.mockReset().mockResolvedValue(sample().features)
  add.mockReset().mockResolvedValue(undefined)
  vi.mocked(createImageExtractor).mockReturnValue({ extract, dispose: vi.fn() })
})
afterEach(cleanup)
function files() {
  return [
    new File(['test'], 'a.png', { type: 'image/png' }),
    new File(['test'], 'b.png', { type: 'image/png' }),
  ]
}

it('defaults to different synthetic identities, hides the manual ID, and saves a unique ID per image', async () => {
  const onSaved = vi.fn().mockResolvedValue(undefined)
  render(<ImageBatchImporter disabled={false} onActivity={vi.fn()} onSaved={onSaved} />)
  expect((screen.getByLabelText('Import mode') as HTMLSelectElement).value).toBe(
    'different-identities',
  )
  expect(screen.queryByLabelText('Participant ID')).toBeNull()
  fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'angry' } })
  fireEvent.change(screen.getByLabelText('Choose image batch'), { target: { files: files() } })
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(add).toHaveBeenCalledTimes(2)
  const first = add.mock.calls[0][0][0]
  const second = add.mock.calls[1][0][0]
  expect(first.participantId).not.toBe(second.participantId)
  expect(first.sessionId).toBe(second.sessionId)
  expect(first).toMatchObject({ label: 'angry', source: 'synthetic', features: sample().features })
  expect(screen.queryByRole('alert')).toBeNull()
})
it('supports the original same-identity behavior and validates the manual participant', async () => {
  const onSaved = vi.fn().mockResolvedValue(undefined)
  render(<ImageBatchImporter disabled={false} onActivity={vi.fn()} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'same-identity' } })
  fireEvent.change(screen.getByLabelText('Choose image batch'), { target: { files: files() } })
  expect(screen.getByRole('alert').textContent).toContain('Participant ID')
  expect(extract).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Participant ID'), { target: { value: 'person-001' } })
  fireEvent.change(screen.getByLabelText('Choose image batch'), { target: { files: files() } })
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(add.mock.calls.every(([rows]) => rows[0].participantId === 'person-001')).toBe(true)
})
it('selects same-identity mode for real images and restores automatic mode for synthetic images', () => {
  render(<ImageBatchImporter disabled={false} onActivity={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'real' } })
  expect((screen.getByLabelText('Import mode') as HTMLSelectElement).value).toBe('same-identity')
  expect(screen.getByLabelText('Participant ID')).toBeDefined()
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'synthetic' } })
  expect(screen.queryByLabelText('Participant ID')).toBeNull()
  expect(screen.getByRole('option', { name: 'angry' })).toBeDefined()
  expect(screen.queryByRole('option', { name: 'frown' })).toBeNull()
})
