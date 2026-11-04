export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Analysis cancelled.', 'AbortError')
}
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
