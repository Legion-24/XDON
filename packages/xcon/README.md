# @legion24/xcon — JavaScript/TypeScript

XCON parser and stringifier for Node.js and browsers. Includes optional macro preprocessing.

---

## Installation

```bash
npm install @legion24/xcon
```

---

## Usage

### Parse XCON

```typescript
import { parse } from '@legion24/xcon';

const xcon = `
(name,age,role)
alice:{Alice,30,admin}
bob:{Bob,25,user}
`;

const data = parse(xcon);
// {
//   alice: { name: 'Alice', age: 30, role: 'admin' },
//   bob: { name: 'Bob', age: 25, role: 'user' }
// }
```

### Stringify to XCON

```typescript
import { stringify } from '@legion24/xcon';

const data = [
  { name: 'Alice', role: 'admin', active: true },
  { name: 'Bob', role: 'user', active: false },
];

const xcon = stringify(data);
// (name,role,active)
// {Alice,admin,true}
// {Bob,user,false}
```

### Macros (Preprocessing)

Use macros to reduce repetition and add dynamic values:

```typescript
import { expand, parse } from '@legion24/xcon';

const xconWithMacros = `
%header = "(id,name,email)"
%admin = "true"

%header
emp1:{1,Alice,alice@example.com,%admin}
emp2:{2,Bob,bob@example.com,false}
`;

const expanded = expand(xconWithMacros);
const data = parse(expanded);
```

**Simple macros:**
- `%name = "value"` — define a variable
- `%name` — expand the variable

**Parameterized macros:**
- `%row(a,b) = "{a},{b}"` — template with placeholders
- `%row(x,y)` — expand with arguments

**Expression macros:**
- `%{2+3*4}` — evaluate arithmetic (14)

**Built-in macros:**
- `%_DATE_STR` — current date
- `%_TIME_STR` — current time
- `%_UUID` — random UUID v4
- `%_ENV(VAR)` — environment variable

See [MACROS.md](../../MACROS.md) for full documentation.

---

## API

### `parse(input, options?)`

Parse XCON and return a JavaScript object.

```typescript
parse(input: string, options?: ParseOptions): unknown;

interface ParseOptions {
  strict?: boolean; // default: true
}
```

### `stringify(data, options?)`

Convert a JavaScript object to XCON.

```typescript
stringify(data: unknown, options?: StringifyOptions): string;

interface StringifyOptions {
  // (future options for formatting, etc.)
}
```

### `expand(input, options?)`

Expand macros in XCON text (preprocessing step).

```typescript
expand(input: string, options?: ExpandOptions): string;

interface ExpandOptions {
  initialContext?: MacroContext;
  strict?: boolean;  // default: true
  maxDepth?: number; // default: 16
}

type MacroContext = Map<string, MacroDefinition>;

interface MacroDefinition {
  body: string;
  params: string[] | null;
  sourceLine: number;
}
```

### `parseToAST(input)`

Parse XCON and return the raw AST (for advanced use).

```typescript
parseToAST(input: string): XCONDocument;
```

---

## Error Handling

Both parse and expand throw typed errors:

```typescript
import { XCONParseError, XCONMacroError } from '@legion24/xcon';

try {
  const data = parse(malformed);
} catch (err) {
  if (err instanceof XCONParseError) {
    console.error(`Parse error at ${err.line}:${err.column}: ${err.message}`);
  }
}

try {
  const expanded = expand(xconWithMacros);
} catch (err) {
  if (err instanceof XCONMacroError) {
    console.error(`Macro error at ${err.line}:${err.column}: ${err.message}`);
  }
}
```

---

## Examples

### Dynamic Data with Macros

```typescript
const xcon = `
%count = "5"
(id,value,generated)
{1,%{%count*10},%_DATE_STR}
{2,%{%count*20},%_DATE_STR}
`;

const expanded = expand(xcon);
const data = parse(expanded);
// [
//   { id: 1, value: 50, generated: '2026-04-30' },
//   { id: 2, value: 100, generated: '2026-04-30' }
// ]
```

### Pre-defined Macros

```typescript
const ctx = new Map([
  ['env', { body: 'production', params: null, sourceLine: 0 }],
  ['timeout', { body: '30000', params: null, sourceLine: 0 }],
]);

const xcon = `(env,timeout)
config:{%env,%timeout}`;

const expanded = expand(xcon, { initialContext: ctx });
const data = parse(expanded);
// { config: { env: 'production', timeout: 30000 } }
```

### Round-Trip (Parse → Stringify → Parse)

```typescript
const original = `(name,age)\nalice:{Alice,30}`;
const parsed = parse(original);
const stringified = stringify(parsed);
const reparsed = parse(stringified);

console.log(JSON.stringify(parsed) === JSON.stringify(reparsed)); // true
```

---

## Format Overview

XCON is a token-efficient alternative to JSON. It defines structure once in a header, then repeats only data:

```
(name,age,role)
alice:{Alice,30,admin}
bob:{Bob,25,user}
```

Parse to:
```json
{
  "alice": { "name": "Alice", "age": 30, "role": "admin" },
  "bob": { "name": "Bob", "age": 25, "role": "user" }
}
```

Features:
- **Token efficient** — 20–35% fewer tokens vs JSON for multi-record data
- **Type inference** — `null`, `true`/`false`, integers, floats, strings
- **Arrays & nesting** — full support for `[]` and nested `{}` blocks
- **Macros** — optional preprocessing for DRY, dynamic, and parameterized content

See [SPEC.md](../../SPEC.md) for full grammar.

---

## Packages

| Package | Language |
|---------|----------|
| `@legion24/xcon` | JavaScript / TypeScript (this) |
| `xcon` | Python |

---

## License

MIT
