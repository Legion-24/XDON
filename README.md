# XCON

> eXtensible Compact Object Notation — a schema-ambient text format for structured data.

> **Public-review beta — `1.0.0-beta.1`.** The grammar and semantics described here are **proposed-frozen** for the v1.0 stability guarantee. We're soliciting feedback from real users before tagging `1.0.0` final. Please open an issue with feedback on spec ambiguity, naming, parser edge cases, or extensibility concerns. See [CHANGELOG.md](./CHANGELOG.md) for the migration from `0.1.0`.

XCON declares the schema once and carries only values, producing payloads typically 30–40% smaller than equivalent JSON for tabular data. v1.0 ships a frozen text format, a JSON bridge, and an optional text-preprocessing macro layer.

---

## Why XCON?

JSON repeats keys for every object in an array. XCON declares the schema once in a header and repeats only values:

**JSON** (107 tokens):

```json
[
  {"id": 1, "name": "Alice", "role": "admin", "active": true},
  {"id": 2, "name": "Bob",   "role": "user",  "active": false},
  {"id": 3, "name": "Carol", "role": "user",  "active": true}
]
```

**XCON** (74 tokens — 31% fewer):

```
(id,name,role,active)
{1,Alice,admin,true}
{2,Bob,user,false}
{3,Carol,user,true}
```

See [benchmarks.md](./benchmarks.md) for methodology.

---

## What v1.0 Includes

| Component | Status |
|-----------|--------|
| **XCON/text** — text format and parser | ✅ Stable (this release) |
| **JSON bridge** — `toJSON` / `fromJSON` | ✅ Stable |
| **Text macros** — `%`-preprocessor (variables, parameters, expressions, built-ins) | ✅ Stable |
| BXCON — binary wire encoding | 📋 Planned (post-v1.0) |
| XCON/schema — schema validation | 📋 Planned |
| XCON/decorators — `@ref`, `@lazy`, `@fn`, `@sql`, `@rest`, `@cache`, `@macro` | 📋 Planned |
| XCON/stream — streaming protocol | 📋 Planned |
| Adapters — fetch/express/axios/prisma | 📋 Planned |

The v1.0 backward-compatibility guarantee covers only the components marked stable. Planned layers will be additive and will not change v1.0 syntax.

See [SPEC.md](./SPEC.md) for the formal specification and [MACROS.md](./MACROS.md) for the macro reference.

---

## Format at a Glance

```
(name,tags[],address:(city,zip))
alice:{Alice,[admin,developer],{NYC,10001}}
bob:{Bob,[user],{LA,90001}}
```

- **Header** `(...)` — declares field names once.
- **Row label** `alice:` — optional key; produces an object when present, an array when absent.
- **Arrays** `[...]` — declared with `[]` suffix in the header.
- **Nested objects** `(sub,fields)` — sub-schemas declared inline.
- **Types** — inferred from bare values: `null`, `true`/`false`, integers, floats, strings.

---

## Installation

**JavaScript / TypeScript**

```bash
npm install @legion24/xcon@beta
```

**Python**

```bash
pip install --pre xcon
```

(Both packages publish under the `beta` / pre-release tag during the public-review window. Once `1.0.0` final is tagged, drop the `@beta` / `--pre` flag.)

---

## Usage

### TypeScript

```ts
import { parse, stringify, toJSON, fromJSON, expand, VERSION } from '@legion24/xcon';

const data = [
  { name: 'Alice', role: 'admin', active: true },
  { name: 'Bob',   role: 'user',  active: false },
];

const xcon = stringify(data);
// (name,role,active)
// {Alice,admin,true}
// {Bob,user,false}

const parsed = parse(xcon);

// JSON bridge:
const json = toJSON(xcon);
const back = fromJSON(json);

// Macros (preprocessing):
const expanded = expand('%h = "(name,age)"\n%h\n{Alice,30}');
const data2 = parse(expanded);

console.log(VERSION); // "1.0.0"
```

### Python

```python
from xcon import parse, stringify, to_json, from_json, expand, VERSION

data = [
    {"name": "Alice", "role": "admin", "active": True},
    {"name": "Bob",   "role": "user",  "active": False},
]

xcon = stringify(data)
parsed = parse(xcon)

# JSON bridge:
js = to_json(xcon)
back = from_json(js)

# Macros:
expanded = expand('%h = "(name,age)"\n%h\n{Alice,30}')
data2 = parse(expanded)

print(VERSION)  # "1.0.0"
```

---

## Parser Options

Both implementations support DoS-protection limits and reserved-character validation:

```ts
parse(input, {
  maxDepth: 64,        // max nesting of {} and [] (default 64)
  maxLength: 16 << 20, // max input bytes (default 16 MiB)
  maxRows: 1_000_000,  // max rows (default 1M)
});
```

```python
from xcon import parse, ParseOptions
parse(input_text, ParseOptions(max_depth=64, max_length=16 * 1024 * 1024, max_rows=1_000_000))
```

Exceeding any limit raises a parse error.

---

## JSON Bridge

XCON ships with a bidirectional JSON bridge:

```ts
import { toJSON, fromJSON } from '@legion24/xcon';

JSON.parse(toJSON(xconText));   // → JS value
fromJSON(JSON.stringify(value)) // → XCON text
```

For values composed of JSON-typed scalars, arrays, and string-keyed objects, round-trip is lossless: `parse(fromJSON(JSON.stringify(x)))` deep-equals `x`.

---

## Macros

Macros run **before** parsing. Full reference in [MACROS.md](./MACROS.md).

```ts
const xcon = `
%row(id,name,email) = "{id,name,email}"

(id,name,email)
emp1:%row(1,Alice,alice@example.com)
emp2:%row(2,Bob,bob@example.com)
`;
const expanded = expand(xcon);
```

Built-ins: `%_DATE_STR`, `%_TIME_STR`, `%_DATETIME_STR`, `%_TIMESTAMP`, `%_DAY_STR`, `%_UUID`, `%_ENV(VAR)` (opt-in via `envAllowlist`).

---

## Reserved Characters

v1.0 reserves `@`, `#`, `!`, `%` at the **leading position** of bare values for future XCON layers. To use these as content, quote or escape:

```
{"@alice"}        ✅ quoted
{\@alice}         ✅ escaped
{@alice}          ❌ parse error in v1.0
{user@example.com}✅ @ is mid-value, not leading
```

This reservation guarantees that future XCON revisions can introduce syntax beginning with these characters without invalidating v1.0 documents.

---

## Packages

| Package | Language | Path |
|---------|----------|------|
| `@legion24/xcon` | TypeScript / JavaScript | [`packages/xcon`](./packages/xcon) |
| `xcon` | Python | [`packages/xcon-python`](./packages/xcon-python) |

Both implementations conform to the same v1.0 specification and produce equivalent output for all valid inputs.

---

## Versioning

- **v1.x** — backward-compatible additions only. Every v1.0 document parses identically under any v1.x parser.
- **v2.0+** — only a major version bump may break v1.0 syntax, and only after a deprecation cycle.

See [SPEC.md § Versioning Policy](./SPEC.md#versioning-policy).

---

## Contributing

Issues and PRs welcome. Read [SPEC.md](./SPEC.md) before contributing to a parser — the spec is the source of truth, and parser behavior must match it.

---

## License

MIT — see [LICENSE](./LICENSE)
