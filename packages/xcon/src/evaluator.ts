const INT_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d+\.\d+$/;

/**
 * Type-infer a bare (unquoted) scalar's text into a JSON-compatible value.
 * Quoted strings must NOT be passed here — they are always strings.
 */
export function inferType(raw: string): string | number | boolean | null {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  if (INT_RE.test(raw)) {
    // Use Number for safe range; fall back to the original string if not safe.
    const n = Number(raw);
    if (Number.isSafeInteger(n)) {
      // Normalize -0 to 0 (JSON does not distinguish them as integers).
      return n === 0 ? 0 : n;
    }
    // Beyond safe integer range — preserve the string to avoid lossy conversion.
    return raw;
  }

  if (FLOAT_RE.test(raw)) {
    return parseFloat(raw);
  }

  return raw;
}
