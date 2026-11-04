import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DatasetFiles } from './DatasetFiles'
import { sample } from '../test/fixtures'
import { exportDatasetJson } from '../lib/datasetExport'

afterEach(cleanup)
it('requires explicit typed confirmation before deleting all local data', async () => {
  const onClear = vi.fn().mockResolvedValue(undefined)
  render(
    <DatasetFiles
      samples={[sample()]}
      disabled={false}
      onClear={onClear}
      onAdd={vi.fn()}
      onRefresh={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Clear dataset' }))
  expect(onClear).not.toHaveBeenCalled()
  const confirm = screen.getByRole('button', { name: 'Delete all samples' }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Confirmation'), { target: { value: 'DELETE' } })
  expect(confirm.disabled).toBe(false)
  fireEvent.click(confirm)
  await waitFor(() => expect(onClear).toHaveBeenCalledOnce())
})
it('validates a JSON import and previews collisions before committing only new samples', async () => {
  const onAdd = vi.fn().mockResolvedValue(undefined)
  const rows = [sample(), sample({ id: 'new', label: 'angry' })]
  const file = new File(['json'], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => exportDatasetJson(rows) })
  render(
    <DatasetFiles
      samples={[sample()]}
      disabled={false}
      onClear={vi.fn()}
      onAdd={onAdd}
      onRefresh={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByLabelText('Import dataset JSON file'), { target: { files: [file] } })
  await screen.findByRole('heading', { name: 'Review JSON import' })
  expect(onAdd).not.toHaveBeenCalled()
  expect(screen.getByText(/existing IDs skipped/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 new samples' }))
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith([rows[1]]))
})
