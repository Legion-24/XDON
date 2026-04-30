import { StringifyOptions } from './ast';
import { XCONStringifyError } from './errors';

interface SchemaField {
  name: string;
  isArray: boolean;
  children: SchemaField[];
}

const RESERVED_LEADING = new Set(['@', '#', '!', '%']);
const SPECIAL_CHARS = /[,{}[\]:()\\\n\t" ']/;

const isBareIdentifier = (s: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);

export function stringify(input: unknown, options: StringifyOptions = {}): string {
  const seen = new WeakSet<object>();
  const rowLabels = options.rowLabels ?? true;

  if (Array.isArray(input)) {
    return stringifyArray(input, seen);
  }

  if (input !== null && typeof input === 'object') {
    return stringifyObject(input as Record<string, unknown>, rowLabels, seen);
  }

  // Scalar input — serialize as a single-row, no-header doc
  return `{${formatScalar(input, seen)}}`;
}

function stringifyArray(arr: unknown[], seen: WeakSet<object>): string {
  if (arr.length === 0) return '';

  // Detect if we should emit a header (array of objects with at least one keyed entry)
  const allObjects = arr.every(
    (x) => x !== null && typeof x === 'object' && !Array.isArray(x),
  );

  if (allObjects && arr.length > 0) {
    const schema = inferSchemaUnion(arr as Record<string, unknown>[]);
    if (schema.length === 0) {
      // All objects are empty
      return arr.map(() => '{}').join('\n');
    }
    const headerLine = formatHeader(schema);
    const rows = arr.map((item) =>
      formatDocumentBySchema(item as Record<string, unknown>, schema, seen),
    );
    return `${headerLine}\n${rows.join('\n')}`;
  }

  // Mixed or array-of-arrays/scalars — emit each row schemaless
  const rows = arr.map((item) => formatRowSchemaless(item, seen));
  return rows.join('\n');
}

function stringifyObject(
  obj: Record<string, unknown>,
  rowLabels: boolean,
  seen: WeakSet<object>,
): string {
  if (seen.has(obj)) {
    throw new XCONStringifyError('Cyclic reference in input');
  }
  seen.add(obj);
  const entries = Object.entries(obj);
  if (entries.length === 0) return '';

  // Determine if all values are objects -> headered schema
  const allValuesObjects = entries.every(
    ([, v]) => v !== null && typeof v === 'object' && !Array.isArray(v),
  );

  if (rowLabels && allValuesObjects) {
    const objects = entries.map(([, v]) => v as Record<string, unknown>);
    const schema = inferSchemaUnion(objects);
    if (schema.length === 0) {
      const rows = entries.map(([key]) => `${formatRowLabel(key)}:{}`);
      seen.delete(obj);
      return rows.join('\n');
    }
    const headerLine = formatHeader(schema);
    const rows = entries.map(
      ([key, value]) =>
        `${formatRowLabel(key)}:${formatDocumentBySchema(value as Record<string, unknown>, schema, seen)}`,
    );
    seen.delete(obj);
    return `${headerLine}\n${rows.join('\n')}`;
  }

  if (rowLabels) {
    // Mixed values — emit each row schemaless
    const rows = entries.map(
      ([key, value]) => `${formatRowLabel(key)}:${formatRowSchemaless(value, seen)}`,
    );
    seen.delete(obj);
    return rows.join('\n');
  }

  // No row labels — treat the whole object as a single row
  const schema = inferSchema(obj);
  const headerLine = formatHeader(schema);
  const row = formatDocumentBySchema(obj, schema, seen);
  seen.delete(obj);
  return headerLine ? `${headerLine}\n${row}` : row;
}

function formatRowLabel(key: string): string {
  if (key.length === 0) return '""';
  if (isBareIdentifier(key) && !RESERVED_LEADING.has(key[0]!)) return key;
  return `"${escapeQuoted(key)}"`;
}

function inferSchema(obj: Record<string, unknown>, seen: WeakSet<object> = new WeakSet()): SchemaField[] {
  if (seen.has(obj)) {
    throw new XCONStringifyError('Cyclic reference in input');
  }
  seen.add(obj);
  const result = Object.entries(obj).map(([name, value]) => buildField(name, value, seen));
  seen.delete(obj);
  return result;
}

function inferSchemaUnion(objects: Record<string, unknown>[], seen: WeakSet<object> = new WeakSet()): SchemaField[] {
  // Preserve the key order of the first object, then append any new keys from later objects.
  const order: string[] = [];
  const fields = new Map<string, SchemaField>();
  for (const obj of objects) {
    if (obj === null || typeof obj !== 'object') continue;
    if (seen.has(obj)) {
      throw new XCONStringifyError('Cyclic reference in input');
    }
    seen.add(obj);
    for (const [name, value] of Object.entries(obj)) {
      if (!fields.has(name)) {
        order.push(name);
        fields.set(name, buildField(name, value, seen));
      } else {
        // Merge: if any row has a non-empty children, prefer that. Same for isArray.
        const existing = fields.get(name)!;
        const candidate = buildField(name, value, seen);
        if (!existing.isArray && candidate.isArray) {
          existing.isArray = true;
        }
        if (existing.children.length === 0 && candidate.children.length > 0) {
          existing.children = candidate.children;
        } else if (
          candidate.children.length > 0 &&
          existing.children.length > 0
        ) {
          existing.children = mergeFields(existing.children, candidate.children);
        }
      }
    }
    seen.delete(obj);
  }
  return order.map((n) => fields.get(n)!);
}

function buildField(name: string, value: unknown, seen: WeakSet<object> = new WeakSet()): SchemaField {
  if (Array.isArray(value)) {
    // Array of objects -> nested schema
    const objs = value.filter((v) => v !== null && typeof v === 'object' && !Array.isArray(v));
    if (objs.length > 0) {
      return {
        name,
        isArray: true,
        children: inferSchemaUnion(objs as Record<string, unknown>[], seen),
      };
    }
    return { name, isArray: true, children: [] };
  }
  if (value !== null && typeof value === 'object') {
    return { name, isArray: false, children: inferSchema(value as Record<string, unknown>, seen) };
  }
  return { name, isArray: false, children: [] };
}

function mergeFields(a: SchemaField[], b: SchemaField[]): SchemaField[] {
  const order: string[] = [];
  const map = new Map<string, SchemaField>();
  for (const f of a) {
    order.push(f.name);
    map.set(f.name, { ...f, children: [...f.children] });
  }
  for (const f of b) {
    if (!map.has(f.name)) {
      order.push(f.name);
      map.set(f.name, { ...f, children: [...f.children] });
    } else {
      const ex = map.get(f.name)!;
      if (!ex.isArray && f.isArray) ex.isArray = true;
      if (ex.children.length === 0 && f.children.length > 0) ex.children = f.children;
      else if (ex.children.length > 0 && f.children.length > 0) {
        ex.children = mergeFields(ex.children, f.children);
      }
    }
  }
  return order.map((n) => map.get(n)!);
}

function formatHeader(schema: SchemaField[]): string {
  return `(${schema.map(formatLabel).join(',')})`;
}

function formatLabel(f: SchemaField): string {
  const name = isBareIdentifier(f.name) && !RESERVED_LEADING.has(f.name[0]!)
    ? f.name
    : `"${escapeQuoted(f.name)}"`;
  if (f.children.length > 0 && f.isArray) {
    return `${name}[]:(${f.children.map(formatLabel).join(',')})`;
  }
  if (f.children.length > 0) {
    return `${name}:(${f.children.map(formatLabel).join(',')})`;
  }
  if (f.isArray) {
    return `${name}[]`;
  }
  return name;
}

function formatDocumentBySchema(
  obj: Record<string, unknown>,
  schema: SchemaField[],
  seen: WeakSet<object>,
): string {
  if (seen.has(obj)) {
    throw new XCONStringifyError('Cyclic reference in input');
  }
  seen.add(obj);
  const parts = schema.map((field) => {
    const value = obj[field.name];
    if (value === undefined) {
      return field.isArray ? '[]' : 'null';
    }
    if (field.isArray) {
      if (!Array.isArray(value)) {
        throw new XCONStringifyError(
          `Field '${field.name}' declared as array but value is not an array`,
        );
      }
      if (field.children.length > 0) {
        // Array of nested objects
        return `[${value.map((item) => {
          if (item === null || typeof item !== 'object' || Array.isArray(item)) {
            throw new XCONStringifyError(
              `Field '${field.name}' declared as array of objects but item is not an object`,
            );
          }
          return formatDocumentBySchema(item as Record<string, unknown>, field.children, seen);
        }).join(',')}]`;
      }
      return `[${value.map((v) => formatScalar(v, seen)).join(',')}]`;
    }
    if (field.children.length > 0) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new XCONStringifyError(
          `Field '${field.name}' declared as nested document but value is not an object`,
        );
      }
      return formatDocumentBySchema(value as Record<string, unknown>, field.children, seen);
    }
    return formatScalar(value, seen);
  });
  seen.delete(obj);
  return `{${parts.join(',')}}`;
}

function formatRowSchemaless(value: unknown, seen: WeakSet<object>): string {
  if (Array.isArray(value)) {
    return `{${value.map((v) => formatScalar(v, seen)).join(',')}}`;
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) {
      throw new XCONStringifyError('Cyclic reference in input');
    }
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>);
    const parts = entries.map(([, v]) => formatScalar(v, seen));
    seen.delete(value);
    return `{${parts.join(',')}}`;
  }
  return `{${formatScalar(value, seen)}}`;
}

function formatScalar(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      // Infinity / NaN — quote as string so it's representable
      return `"${String(value)}"`;
    }
    return String(value);
  }
  if (typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatScalar(v, seen)).join(',')}]`;
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      throw new XCONStringifyError('Cyclic reference in input');
    }
    seen.add(value as object);
    const entries = Object.entries(value as Record<string, unknown>);
    const inner = entries.map(([, v]) => formatScalar(v, seen)).join(',');
    seen.delete(value as object);
    return `{${inner}}`;
  }
  if (typeof value === 'string') {
    return formatString(value);
  }
  throw new XCONStringifyError(`Unsupported value type: ${typeof value}`);
}

function formatString(s: string): string {
  if (s === '') return '""';
  if (s === 'null' || s === 'true' || s === 'false') return `"${s}"`;
  if (/^-?\d+$/.test(s) || /^-?\d+\.\d+$/.test(s)) return `"${s}"`;
  if (RESERVED_LEADING.has(s[0]!)) return `"${escapeQuoted(s)}"`;
  if (SPECIAL_CHARS.test(s)) return `"${escapeQuoted(s)}"`;
  return s;
}

function escapeQuoted(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}
