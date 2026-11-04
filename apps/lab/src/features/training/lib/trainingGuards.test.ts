import { expect, it } from 'vitest'
import { prepareDataset } from './prepareDataset'
import { trainingDataset } from '../test/fixtures'
import { assertTrainingSplits } from './trainingGuards'

it('rejects sample, participant and vector leakage before allocating training tensors', () => {
  const data = prepareDataset(trainingDataset(10))
  expect(() => assertTrainingSplits(data)).not.toThrow()
  const copy = structuredClone(data)
  copy.splits.test[0].id = copy.splits.train[0].id
  expect(() => assertTrainingSplits(copy)).toThrow('sample ID')
  const people = structuredClone(data)
  people.splits.test[0].participantId = people.splits.train[0].participantId
  expect(() => assertTrainingSplits(people)).toThrow('Participant leakage')
  const vectors = structuredClone(data)
  vectors.splits.test[0].features = [...vectors.splits.train[0].features]
  expect(() => assertTrainingSplits(vectors)).toThrow('duplicate vectors')
})
