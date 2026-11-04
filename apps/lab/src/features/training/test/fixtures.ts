import { dataset } from '../../dataset/test/fixtures'
import { trainingLabels } from '../types/training'

export function trainingDataset(perClass = 50, sharedParticipants = false) {
  return dataset(
    trainingLabels.flatMap((label, labelIndex) =>
      Array.from({ length: perClass }, (_, index) => {
        const features = Array(52).fill(0) as number[]
        features[labelIndex] = 0.5 + ((index + 1) / (perClass + 1)) * 0.25
        return {
          id: `${label}-${index}`,
          participantId: sharedParticipants ? `person-${index}` : `${label}-person-${index}`,
          sessionId: `session-${label}-${index}`,
          label,
          source: 'synthetic' as const,
          features,
          createdAt: '2026-11-01T10:00:00.000Z',
        }
      }),
    ),
  )
}
