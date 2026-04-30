export function inferType(raw: string): string | number | boolean | null {
  if (raw === 'null') {
    return null;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(raw)) {
    const num = parseInt(raw, 10);
    return num === 0 ? 0 : num;
  }

  if (/^-?\d+\.\d+$/.test(raw)) {
    return parseFloat(raw);
  }

  return raw;
}
