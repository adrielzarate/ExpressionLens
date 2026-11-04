import { vocalModels } from '../models'
import type { VocalModelKey } from '../models'
import { loadVocalModel } from './loadModel'
import type { VocalModelInstance } from './loadModel'
import { analyzeWindows } from './core'
import type { Request, Response } from './protocol'
export function installVocalWorker(defaultModel: VocalModelKey) {
  const send = (response: Response) => self.postMessage(response)
  let model: VocalModelInstance | undefined,
    busy = false
  self.onmessage = async ({ data }: MessageEvent<Request>) => {
    if (busy) {
      send({ type: 'error', message: 'Another SER operation is running.' })
      return
    }
    busy = true
    try {
      if (data.type === 'load') {
        if (model) throw new Error('SER model is already loaded.')
        const key = data.model ?? defaultModel
        if (!Object.hasOwn(vocalModels, key)) throw new Error('Unsupported vocal model.')
        const started = performance.now()
        model = await loadVocalModel(key, (message) => send({ type: 'progress', message }))
        if (
          model.sampleRate !== 16000 ||
          model.labels.join(',') !== vocalModels[key].labels.join(',')
        ) {
          await model.dispose()
          model = undefined
          throw new Error('Unexpected vocal model mapping.')
        }
        send({
          type: 'ready',
          loadMs: performance.now() - started,
          labels: model.labels,
          sampleRate: model.sampleRate,
          normalize: model.normalize,
          ...(model.preprocessing ? { preprocessing: model.preprocessing } : {}),
        })
      } else if (data.type === 'dispose') {
        await model?.dispose()
        model = undefined
        send({ type: 'disposed' })
      } else {
        if (!model) throw new Error('Load the SER model first.')
        const result = await analyzeWindows(
          data.audio,
          model.sampleRate,
          data.seconds,
          data.silenceRms,
          model.labels,
          (pcm) => model!.classify(pcm),
          (done, total) =>
            send({ type: 'progress', message: `Analyzed ${done} / ${total} windows`, done, total }),
        )
        send({ type: 'result', ...result })
      }
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      busy = false
    }
  }
}
