import { expect, it } from 'vitest'
import { createEarlyStopping } from './earlyStopping'

it('monitors validation loss, resets patience on improvements, and stops at ten non-improving epochs', () => {
  const stop = createEarlyStopping(10)
  expect(stop.observe(0.5, 1)).toMatchObject({ improved: true, bestEpoch: 1, shouldStop: false })
  stop.observe(0.6, 2)
  expect(stop.observe(0.4, 3)).toMatchObject({ improved: true, bestEpoch: 3 })
  for (let epoch = 4; epoch < 13; epoch++) expect(stop.observe(0.4, epoch).shouldStop).toBe(false)
  expect(stop.observe(0.7, 13)).toMatchObject({ shouldStop: true, bestEpoch: 3, bestLoss: 0.4 })
})
it('rejects invalid losses and patience', () => {
  expect(() => createEarlyStopping(0)).toThrow()
  expect(() => createEarlyStopping(10).observe(NaN, 1)).toThrow('not finite')
})
