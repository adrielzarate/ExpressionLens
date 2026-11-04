import wav2vec from './assets.json'
import emotion2vec from '../../experiments/vocal/emotion2vec-assets.json'
export const vocalModels = {
  wav2vec2: {
    name: 'Wav2Vec2 SUPERB ER',
    manifest: wav2vec,
    dtype: 'q4',
    labels: ['neu', 'hap', 'ang', 'sad'],
    preprocessing: 'wav2vec2-raw-16khz-do-normalize-false-v1',
    presentation: {
      neu: { name: 'Neutral', color: '#c3d7ee' },
      hap: { name: 'Happy / excited', color: '#c4df9c' },
      ang: { name: 'Angry', color: '#eca99d' },
      sad: { name: 'Sad', color: '#c4b4df' },
    },
    description:
      'Four categories, fine-tuned on English IEMOCAP acted/improvised speech. Spanish and natural interviews are out-of-domain tests.',
  },
  emotion2vec: {
    name: 'Emotion2vec+ Base',
    manifest: emotion2vec,
    dtype: 'fp32',
    labels: [
      'angry',
      'disgusted',
      'fearful',
      'happy',
      'neutral',
      'other',
      'sad',
      'surprised',
      'unknown',
    ],
    preprocessing: 'emotion2vec-embedded-normalization-mean-pool-linear-head-v1',
    presentation: {
      angry: { name: 'Angry', color: '#eca99d' },
      disgusted: { name: 'Disgusted', color: '#aacbb1' },
      fearful: { name: 'Fearful', color: '#d8b7de' },
      happy: { name: 'Happy', color: '#c4df9c' },
      neutral: { name: 'Neutral', color: '#c3d7ee' },
      other: { name: 'Other', color: '#cfc7b9' },
      sad: { name: 'Sad', color: '#c4b4df' },
      surprised: { name: 'Surprised', color: '#f3d19c' },
      unknown: { name: 'Unknown (model category)', color: '#b9ced0' },
    },
    description:
      'Nine categories from the published FP32 ONNX encoder and classification head. Larger download and memory requirements; performance on your device must be measured.',
  },
} as const
export type VocalModelKey = keyof typeof vocalModels
export type VocalModel = (typeof vocalModels)[VocalModelKey]
export type VocalDtype = VocalModel['dtype']
export function findVocalModel(metadata?: { modelId: string; revision: string; dtype: string }) {
  return Object.values(vocalModels).find(
    (model) =>
      model.manifest.modelId === metadata?.modelId &&
      model.manifest.revision === metadata.revision &&
      model.dtype === metadata.dtype,
  )
}
