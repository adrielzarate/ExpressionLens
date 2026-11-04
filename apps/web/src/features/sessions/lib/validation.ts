export function object(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${context} must be an object.`)
  return value as Record<string, unknown>
}
export function keys(
  value: Record<string, unknown>,
  allowed: string[],
  context: string,
  strict: boolean,
) {
  if (strict && Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error(`${context} contains unsupported fields.`)
}
export function text(value: unknown, field: string, max = 200, trimmed = true): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    (trimmed && value !== value.trim()) ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new Error(`${field} must be non-empty text (maximum ${max} characters).`)
  return value
}
export function numeric(
  value: unknown,
  field: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error(
      `${field} must be a finite ${integer ? 'integer' : 'number'} between ${min} and ${max}.`,
    )
  return value
}
