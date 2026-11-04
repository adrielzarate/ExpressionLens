export function createEarlyStopping(patience: number) {
  let bestLoss = Infinity,
    bestEpoch = 0,
    wait = 0
  if (!Number.isInteger(patience) || patience < 1)
    throw new Error('Patience must be a positive integer.')
  return {
    observe(validationLoss: number, epoch: number) {
      if (!Number.isFinite(validationLoss))
        throw new Error('Validation loss is not finite. Training was stopped.')
      const improved = validationLoss < bestLoss
      if (improved) {
        bestLoss = validationLoss
        bestEpoch = epoch
        wait = 0
      } else wait += 1
      return { improved, shouldStop: wait >= patience, bestEpoch, bestLoss }
    },
    get bestEpoch() {
      return bestEpoch
    },
    get bestLoss() {
      return bestLoss
    },
  }
}
