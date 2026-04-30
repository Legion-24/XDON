# Changelog

All notable changes to XCON are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-beta.1] — Public-review beta

This is the first public-review release of XCON. The text grammar, type-inference rules, output semantics, and reserved-character set are **proposed-frozen**: any further breaking changes before `1.0.0` final will be called out as `BETA-BREAKING` in this changelog and the relevant migration guidance will be added below. Please open issues with feedback before the `1.0.0` final tag.

### What's stable in this beta

- **XCON/text** — text format and parser (TypeScript and Python)
- **JSON bridge** — `toJSON`/`fromJSON`
- **Text macros** — `%`-preprocessor: variables, parameters, expressions, built-ins (`%_DATE_STR`, `%_TIME_STR`, `%_DATETIME_STR`, `%_TIMESTAMP`, `%_DAY_STR`, `%_UUID`, `%_ENV(VAR)`)

### Out of scope for v1.0

The following layers are referenced in the spec for forward-compatibility planning but **are not implemented and not part of the v1.0 stability surface**:

- BXCON binary encoding
- XCON/schema validation
- XCON/decorators (`@ref`, `@lazy`, `@fn`, `@sql`, `@rest`, `@cache`, `@macro`)
- XCON/stream
- Adapters (`xconFetch`, express, axios, prisma)

These layers are reserved namespace-wise (via reserved leading characters `@`, `#`, `!`, `%`) so they can be added in v1.x or beyond without breaking v1.0 documents.

### How to give feedback

- Read [SPEC.md](./SPEC.md), [MACROS.md](./MACROS.md), [README.md](./README.md).
- Try both packages (`@legion24/xcon` and `xcon` on PyPI).
- Open an issue with: spec ambiguity, parser-vs-spec divergence, missing edge case, naming concerns, or extensibility concerns.

---

## Migration: 0.1.0 → 1.0.0-beta.1

If you used `xcon` v0.1.0, the following changes are observable. Plan to update your inputs and code accordingly.

### Breaking — input syntax

1. **Reserved leading characters.** Bare values and labels can no longer begin with `@`, `#`, `!`, or `%`. Reserve these for future XCON layers (decorators, comments, directives, macros).

   Migration: quote the value (`"@user"`) or escape it (`\@user`).

   ```text
   # before (v0.1.0):  {@alice}
   # after  (v1.0):    {"@alice"}   or   {\@alice}
   ```

   `@` is still allowed mid-value, so `user@example.com` continues to parse as a single bare string.

2. **Quoted strings stay strings.** Type inference is now applied **only to bare (unquoted) values**. A quoted `"null"`, `"true"`, `"42"`, etc. is the literal string and is no longer coerced to a JSON null/boolean/number.

   ```text
   # before (v0.1.0): {"null"}  →  [null]
   # after  (v1.0):   {"null"}  →  ["null"]
   ```

3. **Schema enforcement on read.** A field declared `tags[]` must receive an array; a field declared `addr:(...)` must receive a nested document. Receiving a scalar in either slot is now a parse error.

   ```text
   (tags[])
   {single}      # before: silently coerced to [single]; after: ParseError
   ```

4. **Trailing commas in headers also error.** v0.1.0 only checked trailing commas in documents/arrays; v1.0 also rejects `(a,b,)`.

5. **Mixed labeled/unlabeled rows error has a real line:column.** Was reported as `0:0` in v0.1.0; now points at the offending row.

6. **Empty-document semantics clarified.** A literal `{}` parses to `[]`, regardless of header presence. To represent "all-default" with a header, use explicit values: `{null,null,null}`. (No behavior change vs. v0.1.0 in either implementation, but the spec previously contradicted itself; the rule is now explicit.)

### Breaking — `_ENV` macro is opt-in

`%_ENV(VAR)` no longer reads the process environment by default. This was a security gap: documents from untrusted sources could exfiltrate secrets via `%_ENV(AWS_SECRET_ACCESS_KEY)`.

To re-enable env access, pass an allowlist:

```ts
// TypeScript
expand(source, { envAllowlist: ['NODE_ENV', 'PORT'] });
expand(source, { envAllowlist: '*' });   // allow everything (NOT recommended for untrusted input)
```

```python
# Python
from xcon import expand, ExpandOptions
expand(source, ExpandOptions(env_allowlist=['NODE_ENV', 'PORT']))
expand(source, ExpandOptions(env_allowlist='*'))
```

Without an allowlist, `%_ENV(...)` returns the empty string.

### Breaking — built-ins are evaluated per-reference

In v0.1.0, every `%_UUID` in a single document expanded to the same UUID. v1.0 evaluates built-ins **on each reference**, so `id:%_UUID,backup:%_UUID` produces two distinct UUIDs as you'd expect. Same for `%_TIMESTAMP`, `%_DATE_STR`, etc.

If you relied on identical values within one expansion, capture the value in a user macro: `%X = "%_UUID"\n%X %X`.

### Breaking — `%_ENV` can be overridden

User-defined `%_ENV = "..."` (or `%_ENV(name) = "..."`) now correctly shadows the built-in for the rest of the document. Previously the built-in always won.

### Breaking — placeholder substitution honors longest-match

In v0.1.0, parameterized macro `%m(a,ab) = "{a}{ab}"` would corrupt output because naive `str.replace` substituted `{a}` inside `{ab}` first. v1.0 substitutes by longest-name-first, so `%m(X,Y)` correctly produces `XY`.

If your macros depended on the buggy substitution order, rename parameters so they don't share a prefix.

### Breaking — stringifier is now schema-aware across rows

In v0.1.0, the stringifier inferred the schema from the **first row only**. Heterogeneous arrays-of-objects silently lost keys present only in later rows.

```js
// before (v0.1.0)
stringify([{a:1, b:2}, {a:3, c:4}]);
// → (a,b)\n{1,2}\n{3,4}    // c is dropped!

// after (v1.0)
stringify([{a:1, b:2}, {a:3, c:4}]);
// → (a,b,c)\n{1,2,null}\n{3,null,4}
```

Round-trip is now lossless for heterogeneous arrays-of-objects.

### Breaking — stringifier recurses into nested arrays-of-objects

In v0.1.0, an array of nested objects in a stringified output flattened to positional values, losing keys: `[{city:'NYC'}]` became `[['NYC']]` on round-trip. v1.0 emits a proper nested schema (`addrs[]:(city)`) and round-trips losslessly.

### Breaking — cyclic input raises `XCONStringifyError`

v0.1.0 would silently recurse to a stack overflow. v1.0 detects cycles and raises a typed error.

### Breaking — Python parser API takes `ParseOptions`

```python
# before (v0.1.0)
parse(text)

# after (v1.0)
from xcon import parse, ParseOptions
parse(text, ParseOptions(max_depth=64, max_length=16 * 1024 * 1024, max_rows=1_000_000))
```

The default behavior is unchanged. Pass `ParseOptions` only if you need to override limits. Same for the TypeScript `parse(input, options)`.

### Breaking — Python public exports

- `XCONDocument`, AST node types, etc. remain exported but should be considered **internal**. Public stable surface for v1.0 is: `parse`, `parse_to_ast`, `stringify`, `to_json`, `from_json`, `expand`, the three error classes, `ParseOptions`, `ExpandOptions`, `MacroDefinition`, `MacroContext`, `VERSION`.

### Non-breaking additions

- New parser limits: `maxDepth` (default 64), `maxLength` (default 16 MiB), `maxRows` (default 1,000,000).
- Optional `!XCON 1.0` version directive at the top of a document. Unknown `!`-directives error (this is the contract that lets future versions add directives safely).
- TypeScript exports `inferType`, `tokenize`, `Token`, `TokenType`, `VERSION`.
- Python exports `ParseOptions`, `DEFAULT_MAX_DEPTH`, `DEFAULT_MAX_LENGTH`, `DEFAULT_MAX_ROWS`, `VERSION`.

### Bug fixes (no migration needed)

- **TS**: `inferType('-0')` now returns `0` (was `-0`).
- **TS**: integers beyond `Number.MAX_SAFE_INTEGER` preserved as strings to avoid silent precision loss.
- **TS**: `Infinity`/`NaN` round-trip as quoted strings.
- **TS**: `bigint` values serialize correctly.
- **PY**: `infer_type` regex anchored — `--5` no longer crashes with a raw `ValueError`; `-.5` and `1.` no longer mis-parse as floats.
- **PY**: quoted labels in headers and row positions accepted (was a `KeyError`-shaped crash).
- **PY**: dataclass fields use `field(default_factory=list)` instead of `None` + `__post_init__`.

---

## [0.1.0]

Initial development release. Not stability-guaranteed.

[1.0.0-beta.1]: https://github.com/legion24/xcon/releases/tag/v1.0.0-beta.1
[0.1.0]: https://github.com/legion24/xcon/releases/tag/v0.1.0
