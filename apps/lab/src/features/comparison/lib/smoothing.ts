import type { SmoothingLevel } from '../types/comparison'
export const smoothingAlpha: Record<SmoothingLevel, number> = {
  disabled: 1,
  low: 0.8,
  medium: 0.5,
  high: 0.3,
}
export const faceLossResetMs = 500
export function createSmoother() {
  let previous: number[] | null = null
  let lastAt: number | null = null
  let lastLevel: SmoothingLevel | null = null
  return {
    reset() {
      previous = null
      lastAt = null
      lastLevel = null
    },
    apply(values: readonly number[], level: SmoothingLevel, now: number): number[] {
      if (values.length !== 4 || values.some((value) => !Number.isFinite(value)))
        throw new Error('Smoothing requires four finite values.')
      if (lastAt === null || now - lastAt >= faceLossResetMs || lastLevel !== level) previous = null
      const alpha = smoothingAlpha[level]
      const result = values.map((value, index) =>
        previous ? alpha * value + (1 - alpha) * previous[index] : value,
      )
      previous = [...result]
      lastAt = now
      lastLevel = level
      return result
    },
  }
}
