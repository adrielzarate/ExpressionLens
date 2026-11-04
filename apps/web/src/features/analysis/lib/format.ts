export function formatTime(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 100) / 10
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}
