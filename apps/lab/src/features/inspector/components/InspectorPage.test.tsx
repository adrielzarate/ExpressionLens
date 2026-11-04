import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InspectorPage } from './InspectorPage'
import { captureSnapshot } from '../lib/capture'
import { frame } from '../../comparison/test/fixtures'
import type { InspectorSnapshot } from '../types'

vi.mock('./InspectorLive', () => ({ InspectorLive: () => <div>Live camera infrastructure</div> }))
afterEach(cleanup)
it('compares arbitrary captures, sorts by difference and compares disjoint group means', async () => {
  const first = await captureSnapshot(frame(1000), 'smile', 'showing teeth', null, 1100)
  const otherFrame = frame(1000)
  otherFrame.blendshapes = otherFrame.blendshapes.map((row) => ({
    ...row,
    score: row.name.startsWith('browDown') ? 0.9 : 0,
  }))
  const second = await captureSnapshot(otherFrame, 'angry', 'clenched', null, 1100)
  function Harness() {
    const [snapshots, setSnapshots] = useState<InspectorSnapshot[]>([first, second])
    return (
      <InspectorPage
        snapshots={snapshots}
        onSnapshotsChange={setSnapshots}
        onBusyChange={vi.fn()}
      />
    )
  }
  render(<Harness />)
  expect(screen.getByRole('heading', { name: 'Blendshape Inspector.' })).toBeDefined()
  const comparison = screen.getByRole('region', { name: 'Snapshot comparison' })
  expect(within(comparison).getAllByRole('row')[1].textContent).toContain('browDownLeft')
  fireEvent.change(screen.getByLabelText('Sort Snapshot comparison'), { target: { value: 'name' } })
  expect(within(comparison).getAllByRole('row')[1].textContent).toContain('_neutral')
  fireEvent.click(screen.getByLabelText('Group A · #1'))
  fireEvent.click(screen.getByLabelText('Group B · #2'))
  expect(screen.getByRole('region', { name: 'Group mean comparison' })).toBeDefined()
  expect(screen.getByText(/Group A: 1 snapshots/)).toBeDefined()
  fireEvent.click(screen.getByLabelText('Group B · #1')) // Moving a capture removes it from A.
  expect(screen.queryByRole('region', { name: 'Group mean comparison' })).toBeNull()
  expect((screen.getByLabelText('Group A · #1') as HTMLInputElement).checked).toBe(false)
  expect(screen.getAllByText(/Neural prediction unavailable/)).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Clear snapshots' }))
  expect(screen.getByText(/No snapshots yet/)).toBeDefined()
})
