import { StringifyOptions } from './ast';

export function stringify(
  input: Record<string, unknown> | unknown[],
  options: StringifyOptions = {},
): string {
  const {
    rowLabels = true,
  } = options;

  if (Array.isArray(input)) {
    return stringifyArray(input, rowLabels);
  }

  return stringifyObject(input, rowLabels);
}

function stringifyArray(arr: unknown[], rowLabels: boolean): string {
  if (arr.length === 0) {
    return '';
  }

  const first = arr[0];

  // Infer schema from first element
  if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
    const schema = inferSchemaFromObject(first as Record<string, unknown>);
    const headerLine = formatHeader(schema);

    const rows = arr
      .map((item) => {
        const docStr = formatDocument(item as Record<string, unknown>, schema);
        return docStr;
      })
      .join('\n');

    return headerLine ? `${headerLine}\n${rows}` : rows;
  }

  // Array of scalars
  const docStr = formatDocument(arr, []);
  return docStr;
}

function stringifyObject(
  obj: Record<string, unknown>,
  rowLabels: boolean,
): string {
  if (Object.keys(obj).length === 0) {
    return '';
  }

  const firstValue = Object.values(obj)[0];

  // Infer schema from first value
  if (typeof firstValue === 'object' && firstValue !== null && !Array.isArray(firstValue)) {
    const schema = inferSchemaFromObject(firstValue as Record<string, unknown>);
    const headerLine = formatHeader(schema);

    const rows = Object.entries(obj)
      .map(([key, value]) => {
        const docStr = formatDocument(value as Record<string, unknown>, schema);
        return rowLabels ? `${key}:${docStr}` : docStr;
      })
      .join('\n');

    return headerLine ? `${headerLine}\n${rows}` : rows;
  }

  // Simple object with scalar values
  const schema = inferSchemaFromObject(obj);
  const headerLine = formatHeader(schema);

  const rows = Object.entries(obj)
    .map(([key, value]) => {
      const docStr = formatDocument(value as Record<string, unknown>, schema);
      return rowLabels ? `${key}:${docStr}` : docStr;
    })
    .join('\n');

  return headerLine ? `${headerLine}\n${rows}` : rows;
}

function inferSchemaFromObject(
  obj: unknown,
): { name: string; isArray: boolean; children: { name: string; isArray: boolean; children: unknown[] }[] }[] {
  if (!obj || typeof obj !== 'object') return [];

  if (Array.isArray(obj)) return [];

  const entries = Object.entries(obj as Record<string, unknown>);
  return entries.map(([key, value]) => {
    const isArray = Array.isArray(value);
    const children =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? inferSchemaFromObject(value)
        : [];

    return {
      name: key,
      isArray,
      children,
    };
  });
}

function formatHeader(
  schema: { name: string; isArray: boolean; children: unknown[] }[],
): string {
  if (schema.length === 0) return '';

  const labels = schema.map((s) => {
    const arrayMarker = s.isArray ? '[]' : '';
    if (s.children.length > 0) {
      const nestedLabels = (s.children as { name: string }[])
        .map((c) => c.name)
        .join(',');
      return `${s.name}:(${nestedLabels})`;
    }
    return `${s.name}${arrayMarker}`;
  });

  return `(${labels.join(',')})`;
}

function formatDocument(
  value: unknown,
  _schema: unknown[],
): string {
  if (Array.isArray(value)) {
    const items = value.map((v) => formatValue(v));
    return `{${items.join(',')}}`;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    const items = entries.map(([, v]) => formatValue(v));
    return `{${items.join(',')}}`;
  }

  return `{${formatValue(value)}}`;
}

function formatValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((v) => formatValue(v));
    return `[${items.join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    const items = entries.map(([, v]) => formatValue(v));
    return `{${items.join(',')}}`;
  }

  // String - may need escaping
  const str = String(value);
  if (needsQuoting(str)) {
    return `"${escapeString(str)}"`;
  }
  return str;
}

function needsQuoting(str: string): boolean {
  if (str === '') return false;
  // These chars require quoting, not escaping
  if (str.includes(' ')) return true;
  if (str.includes('"')) return true;
  if (str.includes("'")) return true;
  // Everything else can be escaped or quoted - we choose quoting for simplicity
  if (/[,{}[\]:]/.test(str)) return true;
  return false;
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}
