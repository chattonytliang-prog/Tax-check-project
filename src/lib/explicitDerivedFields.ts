export function explicitDerivedMetadata(
  patch: Record<string, unknown>,
  derivedFieldKeys: string[],
  currentFields: Record<string, boolean> | undefined,
  currentReasons: Record<string, string> | undefined,
  reason: string,
) {
  const fields = { ...(currentFields || {}) }
  const reasons = { ...(currentReasons || {}) }

  derivedFieldKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return
    const value = patch[key]
    if (value === undefined || value === null || value === '') return
    fields[key] = true
    reasons[key] = reason
  })

  return { fields, reasons }
}
