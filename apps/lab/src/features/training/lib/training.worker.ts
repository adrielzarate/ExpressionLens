import { trainModel } from './trainModel'
import type { TrainingRequest, TrainingResponse } from '../types/training'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TrainingRequest>) => void) | null
  postMessage: (message: TrainingResponse, transfer?: Transferable[]) => void
}
scope.onmessage = (event) => {
  if (event.data.type !== 'train') return
  void trainModel(
    event.data.data,
    event.data.config,
    (metrics) => scope.postMessage({ type: 'epoch', metrics }),
    () => scope.postMessage({ type: 'evaluating' }),
  )
    .then((result) => scope.postMessage({ type: 'complete', result }, [result.artifacts.weights]))
    .catch((error: unknown) =>
      scope.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Training failed.',
      }),
    )
}
