export function normalizeTraceIdentifierValue(
  value: string | number | boolean | null | undefined,
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  const normalized = String(value).trim()
  if (!normalized || normalized === '0') {
    return undefined
  }

  return normalized
}

export function isMeaningfulTraceIdentifierValue(
  value: string | number | boolean | null | undefined,
): value is string | number | boolean {
  return typeof normalizeTraceIdentifierValue(value) === 'string'
}
