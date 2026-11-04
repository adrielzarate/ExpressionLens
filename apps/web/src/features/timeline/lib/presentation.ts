import type { TimelineCategory } from './timeline'

export const categoryPresentation: Record<
  TimelineCategory,
  { label: string; symbol: string; color: string }
> = {
  neutral: { label: 'Neutral', symbol: 'N', color: '#dce4e0' },
  smile: { label: 'Smile', symbol: 'S', color: '#d7ebbd' },
  surprise: { label: 'Surprise', symbol: '!', color: '#ffe2ad' },
  angry: { label: 'Angry', symbol: 'A', color: '#f4c2bb' },
  uncertain: { label: 'Uncertain', symbol: '?', color: '#ddd6f0' },
  'no-face': { label: 'No face', symbol: 'Ø', color: '#d8e5f0' },
  'multiple-faces': { label: 'Multiple faces', symbol: '×', color: '#ecd7ba' },
  'not-analyzed': { label: 'Not analyzed', symbol: '—', color: '#f0f1ef' },
}
