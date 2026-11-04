import { vocalModels } from '../models'
import type { VocalModelKey } from '../models'
import { vocalWasmPaths } from './runtime'
export interface VocalModelInstance {
  labels: string[]
  sampleRate: number
  normalize: boolean
  preprocessing?: string
  classify(pcm: Float32Array): Promise<unknown>
  dispose(): Promise<void>
}
export async function loadVocalModel(
  key: VocalModelKey,
  progress: (message: string) => void,
): Promise<VocalModelInstance> {
  // Only the requested adapter is imported and instantiated; no model is preloaded.
  if (key === 'wav2vec2') return (await import('./wav2vec')).loadWav2vec(progress)
  if (key === 'emotion2vec') {
    const emotion = await (
      await import('./emotion2vec')
    ).loadEmotion2vec(vocalWasmPaths(), progress)
    return {
      ...emotion,
      sampleRate: 16000,
      normalize: true,
      preprocessing: vocalModels.emotion2vec.preprocessing,
    }
  }
  throw new Error('Unsupported vocal model.')
}
