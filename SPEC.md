# XCON Specification v1.0.0

> **Status: public-review beta (`1.0.0-beta.1`).** This document is the proposed v1.0 specification. The grammar, type-inference rules, output semantics, and reserved-character set are **proposed-frozen**: any change before the final v1.0 tag will be flagged in [CHANGELOG.md](./CHANGELOG.md) as `BETA-BREAKING`. We are actively soliciting feedback during the public-review window — please open an issue with concerns about ambiguity, edge cases, naming, or extensibility before the tag.

## Overview

**XCON** (eXtensible Compact Object Notation) is a schema-ambient structured data format. The schema is declared once in a header, and the body carries only values, producing payloads typically 30–40% smaller than equivalent JSON text.

This document defines **XCON v1.0.0**, the stable text format. Once `1.0.0` final is tagged, conforming parsers will continue to accept v1.0.0 documents indefinitely. Future evolution happens through the reserved-character namespace (see [Extensibility](#extensibility-and-reserved-characters)) and through optional version directives (see [Version Directive](#version-directive)).

The XCON family also includes additional layers that are **not part of v1.0** and will be specified separately as they stabilize:

- **BXCON** — binary wire encoding *(planned)*
- **XCON/schema** — schema declaration and validation *(planned)*
- **XCON/decorators** — decorator macros (`@ref`, `@lazy`, etc.) *(planned)*
- **XCON/stream** — streaming protocol *(planned)*

These layers are out of scope for v1.0.0. v1.0.0 specifies only the text format and the `%`-prefixed text-preprocessing macro layer.

### Design Goals

- **Schema ambience** — declare structure once, repeat only values.
- **Compactness** — significantly fewer tokens and bytes than JSON for tabular data.
- **Round-trippable with JSON** — for the supported value types, `toJSON(parse(x))` is well-defined and total.
- **Simple grammar** — recursive-descent parsable in a few hundred lines.
- **Stable and extensible** — v1.0 reserves a character namespace so future versions can add syntax without breaking v1.0 documents.

---

## Encoding

XCON documents **MUST** be encoded in **UTF-8**. A leading UTF-8 byte-order mark (BOM, `EF BB BF`) **MAY** be present and **MUST** be skipped by parsers; it is not part of the document content.

Other encodings are out of scope for v1.0.

---

## Format Structure

An XCON document consists of:

1. An **optional header** declaring the schema for all rows.
2. A **body** of zero or more rows.

```
[HEADER]
ROW
ROW
...
```

A document with no rows is valid; it parses to an empty array `[]` (no header) or empty object `{}` (header present).

---

## Header

The header is a parenthesized comma-separated list of labels, terminated by a newline:

```
(label,label,label)
```

- Begins with `(`, ends with `)`.
- Must occupy a single logical line (line continuations are not supported in v1.0).
- If present, must be the first non-empty, non-directive line of the document.
- A document with no header has no shared schema; rows produce arrays-of-values.

### Labels

A **label** is a field name with optional decorations:

| Form | Example | Meaning |
|------|---------|---------|
| Bare name | `name` | Identifier matching `[A-Za-z_][A-Za-z0-9_]*` |
| Quoted name | `"first name"`, `'full-name'` | Allows spaces and most other characters |
| Array marker | `tags[]` | Field value is an array |
| Nested schema | `address:(city,zip)` | Field value is a nested document with the inner schema |
| Nested array of objects | `addrs[]:(city,zip)` | Field value is an array of nested documents |

Quoted labels follow the same quoting and escape rules as quoted scalar values (see [Quoted Strings](#quoted-strings)).

The colon `:` between a label and its nested schema is **part of the header grammar only** and does not appear in row syntax.

### Examples

```
(name,age,active)
(name,tags[])
(name,address:(street,city,zip))
(id,addrs[]:(city,zip),metadata:(created,updated))
```

---

## Body

The body is a sequence of rows separated by newlines. Each row is one of:

- An **unlabeled row**: `{...}`
- A **labeled row**: `label:{...}`, where `label` is a bare or quoted identifier.

A document **MUST NOT** mix labeled and unlabeled rows. All rows must be the same kind.

### Documents

A `{...}` block is called a **document**. It contains zero or more comma-separated **field values**:

```
{}                             // empty
{value}                        // one field
{value1,value2,value3}         // three fields
{value,{nested},[array]}       // mixed
```

Field values are matched **positionally** to header labels (when a header is present).

A field value is one of:

- **Scalar** — a bare word or quoted string (or an empty value between delimiters)
- **Document** — a nested `{...}`
- **Array** — `[...]`

### Empty Documents

A literal `{}` (zero fields) parses to an empty array `[]`, regardless of whether the header declares fields. To represent "all fields default" with a header, use explicit empty values: `{,,,}` is **not** valid (trailing commas error); explicit `null`s are recommended: `{null,null,null}`.

### Arrays

`[...]` denotes an array of zero or more comma-separated field values:

```
[]
[item]
[item1,item2,item3]
```

Items follow the same type-inference rules as scalars. An array of nested documents is allowed even when the header schema is not declared as `[]:(...)`, but parsers **MUST** preserve the nesting — nested documents inside arrays do not inherit the row's schema.

### Trailing Commas

Trailing commas are **not** allowed in headers, documents, or arrays. They are a parse error.

### Duplicate Row Labels

If two rows in the same body share a label, the **last definition wins**. Earlier values are silently overwritten. (Implementations MAY surface a warning but MUST NOT error.)

### Mixed Labeled/Unlabeled Rows

Mixing labeled and unlabeled rows is a parse error. The error MUST report the line and column of the first offending row.

---

## Scalars and Type Inference

A bare (unquoted) scalar value is mapped to a JSON type by the following rules, applied **in order**:

1. The literal token `null` → JSON `null`.
2. The literal tokens `true` / `false` → JSON booleans.
3. Matches the regex `^-?\d+$` → JSON integer.
4. Matches the regex `^-?\d+\.\d+$` → JSON float.
5. Otherwise → JSON string.

Type inference applies **only to bare values**. A quoted value is **always** a string, even if the contents would otherwise match a literal:

| Input | Parsed value |
|-------|--------------|
| `null` | `null` |
| `"null"` | `"null"` (string) |
| `true` | `true` |
| `"true"` | `"true"` (string) |
| `42` | `42` (integer) |
| `"42"` | `"42"` (string) |

### Number Edge Cases

- `-0` parses as integer `0`.
- `1.` and `.5` are **strings** (do not match the float regex).
- `1e5` is a **string** (scientific notation is not native; v1.0 does not recognize it as a number).
- `Infinity`, `NaN` are **strings** (not native; JSON itself does not recognize them).
- Integer precision is implementation-defined and SHOULD match the host language's native integer representation (JavaScript: `Number`/`BigInt` boundary; Python: arbitrary precision).

### Empty Scalars

An empty value between delimiters is the empty string `""`:

```
{,bar}      → ["", "bar"]
{foo,,baz}  → ["foo", "", "baz"]
```

Both `{,}` (one empty field followed by trailing comma) and `{val,}` are parse errors (trailing comma).

### Whitespace

- Whitespace **outside** `{}` and `[]` is ignored (may surround `:` in row labels and `,` in headers).
- Whitespace **inside** `{}` and `[]` is stripped from the start and end of each unquoted value.
- Whitespace **inside quotes** is preserved verbatim.

```
{ foo , bar }     →  ["foo", "bar"]
{"  foo  "}       →  ["  foo  "]
user1 : {x}       ≡  user1:{x}
```

---

## Quoted Strings

Quoted strings use either `"` or `'` as delimiters. Inside a quoted string:

- The matching quote character must be escaped: `\"` or `\'`.
- A literal backslash is escaped: `\\`.
- `\n` and `\t` produce newline and tab respectively.
- Other backslash sequences (e.g. `\x`) emit the character following the backslash literally; `\` followed by EOF is an error.
- Raw newlines inside a quoted string are **not** allowed; use `\n`.

Quoted strings are always typed as JSON strings, regardless of content.

---

## Escape Sequences in Bare Values

Bare (unquoted) values **MAY** use backslash escapes to include otherwise-illegal characters:

| Escape | Meaning |
|--------|---------|
| `\,` | Comma |
| `\{` `\}` | Braces |
| `\[` `\]` | Brackets |
| `\(` `\)` | Parentheses |
| `\:` | Colon |
| `\\` | Backslash |
| `\n` | Newline |
| `\t` | Tab |

Other backslash sequences in bare values are reserved for future use; v1.0 parsers **MUST** emit the character following the backslash literally and **MAY** warn.

Inside quoted strings, escaping is only required for the delimiter and backslash; other special characters need no escaping.

---

## Extensibility and Reserved Characters

v1.0 reserves the following characters at the **leading position** of a bare scalar or label, for use by future XCON revisions and the planned XCON layers:

| Character | Reserved for |
|-----------|--------------|
| `@` | Decorator macros (XCON/decorators) |
| `#` | Comments |
| `!` | Directives (e.g. version, encoding) |
| `%` | Text-preprocessing macros (already defined in [MACROS.md](./MACROS.md)) |

A v1.0 parser **MUST** reject any unquoted bare value or label that begins with one of these characters. To use these characters as ordinary content, **quote the value** (`"@user"`) or **escape it** (`\@user`).

This reservation guarantees that future XCON versions can introduce syntax beginning with these characters without invalidating v1.0 documents — any v1.0 document that conforms to v1.0 will not accidentally collide with future syntax.

Other special characters (`$`, `&`, `*`, `;`, `?`) are **not** reserved at this time; they are valid in quoted strings and (where the grammar allows them) in bare values via escaping. A future major version (v2.0+) may reserve additional characters.

---

## Version Directive

A document **MAY** begin with an optional version directive on its first line:

```
!XCON 1.0
```

- The directive starts with `!XCON` followed by a single space and a `MAJOR.MINOR` version.
- If present, it MUST be the first non-empty line, before any header.
- v1.0 parsers MUST accept `!XCON 1.0` and `!XCON 1.x` for any non-negative `x`, and MAY reject other versions.
- v1.0 parsers MUST treat the absence of a directive as v1.0.

Future versions may add additional `!`-prefixed directives. v1.0 parsers **MUST** reject any unknown `!`-directive (this is the contract that allows future directives to introduce semantics safely).

---

## Output Semantics

Given a parsed XCON document:

| Header | Row labels | Output shape |
|--------|------------|--------------|
| Yes | All present | `{ label: {schema-applied}, ... }` |
| Yes | None present | `[ {schema-applied}, ... ]` |
| No | All present | `{ label: [values...], ... }` |
| No | None present | `[ [values...], ... ]` |

When a header is present:

- Each row's positional values are matched against the schema labels.
- If a row has fewer values than the schema, missing trailing fields are `null`.
- If a row has more values than the schema, the extras are silently discarded. (This is a stability guarantee: future schema extensions can add fields without breaking older documents.)
- A field declared `[]` (array) **MUST** receive an array value or be absent. Receiving a non-array scalar in an array slot is a parse error.
- A field declared with a nested schema **MUST** receive a document or be absent. Receiving a scalar in a nested-schema slot is a parse error.

---

## Parser Limits

To prevent denial-of-service via adversarial input, conforming parsers **MUST** enforce configurable limits and **SHOULD** apply the following defaults:

| Limit | Default | Description |
|-------|---------|-------------|
| `maxDepth` | 64 | Maximum nesting depth of `{}` and `[]` combined |
| `maxLength` | 16 MiB | Maximum input size in UTF-8 bytes |
| `maxRows` | 1,000,000 | Maximum number of rows in the body |

Exceeding any limit is a parse error. Implementations **MUST** expose these limits as parse options.

---

## Grammar (EBNF)

```ebnf
Document      = [ VersionDirective Newline ] [ Header Newline ] Body
VersionDirective = "!XCON" Space Version
Version       = Digit+ "." Digit+

Header        = "(" LabelList ")"
LabelList     = Label ( "," Label )*
Label         = LabelName [ ArrayMarker ] [ ":" "(" LabelList ")" ]
LabelName     = BareLabel | QuotedString
ArrayMarker   = "[" "]"

Body          = Row ( Newline+ Row )* [ Newline+ ]
Row           = [ RowLabel ":" ] Document_
RowLabel      = BareLabel | QuotedString

Document_     = "{" [ FieldList ] "}"
FieldList     = FieldValue ( "," FieldValue )*
FieldValue    = Scalar | Document_ | Array
Array         = "[" [ FieldList ] "]"

Scalar        = BareValue | QuotedString | (* empty *)

BareLabel     = ( Letter | "_" ) ( Letter | Digit | "_" )*
BareValue     = BareValueChar+
BareValueChar = (* any character except: , { } [ ] ( ) : whitespace newline,
                  and not @, #, !, % at the leading position;
                  backslash-escaped specials are allowed *)

QuotedString  = '"' QChar* '"' | "'" SChar* "'"
QChar         = AnyCharExceptDoubleQuoteAndNewline | EscapeSequence
SChar         = AnyCharExceptSingleQuoteAndNewline | EscapeSequence
EscapeSequence = "\\" AnyChar

Letter        = "A".."Z" | "a".."z"
Digit         = "0".."9"
Space         = " "
Newline       = "\n" | "\r\n"
```

Type inference (integer vs float vs string) is applied to the textual content of `BareValue` after parsing; quoted strings are never type-inferred.

---

## Conformance

A v1.0 conforming parser:

1. Accepts all documents that conform to this grammar and produces the output shapes described in [Output Semantics](#output-semantics).
2. Rejects all documents that violate this specification, with errors that include line and column.
3. Reserves the leading characters `@`, `#`, `!`, `%` and rejects bare values/labels beginning with them.
4. Encodes/decodes UTF-8.
5. Enforces the parser limits described above.
6. Does not require, but MAY recognize, the `!XCON 1.0` version directive.

A v1.0 conforming serializer:

1. Produces output that a v1.0 parser will accept and that round-trips to the input value (for inputs in the supported value space: JSON-typed scalars, arrays, and string-keyed objects).
2. Quotes any string that would otherwise tokenize as a non-string scalar (`null`, `true`, `false`, integers, floats), reserved-character-leading values, or contain delimiters/whitespace.
3. Recurses into nested arrays-of-objects and nested objects, preserving schema and key ordering across rows.

---

## Canonical Examples

### Example 1: Simple User List

```
(name,age,active)
alice:{Alice,30,true}
bob:{Bob,25,false}
```

```json
{
  "alice": {"name": "Alice", "age": 30, "active": true},
  "bob":   {"name": "Bob",   "age": 25, "active": false}
}
```

### Example 2: Array of Objects

```
(name,role)
{Alice,admin}
{Bob,user}
```

```json
[
  {"name": "Alice", "role": "admin"},
  {"name": "Bob",   "role": "user"}
]
```

### Example 3: Arrays in Data

```
(name,tags[],verified)
alice:{Alice,[admin,developer],true}
bob:{Bob,[user],false}
```

```json
{
  "alice": {"name": "Alice", "tags": ["admin", "developer"], "verified": true},
  "bob":   {"name": "Bob",   "tags": ["user"],               "verified": false}
}
```

### Example 4: Nested Objects

```
(name,address:(city,zip))
alice:{Alice,{NYC,10001}}
bob:{Bob,{LA,90001}}
```

```json
{
  "alice": {"name": "Alice", "address": {"city": "NYC", "zip": "10001"}},
  "bob":   {"name": "Bob",   "address": {"city": "LA",  "zip": "90001"}}
}
```

### Example 5: Array of Nested Objects

```
(name,addrs[]:(city,zip))
alice:{Alice,[{NYC,10001},{LA,90001}]}
```

```json
{
  "alice": {
    "name": "Alice",
    "addrs": [
      {"city": "NYC", "zip": "10001"},
      {"city": "LA",  "zip": "90001"}
    ]
  }
}
```

### Example 6: Complex Nesting

```
(id,name,profile:(bio,social:(twitter,github)),active)
user1:{1,Alice,{Senior Engineer,{alice_t,alice_g}},true}
user2:{2,Bob,{Product Manager,{bob_t,bob_g}},false}
```

```json
{
  "user1": {
    "id": 1,
    "name": "Alice",
    "profile": {
      "bio": "Senior Engineer",
      "social": {"twitter": "alice_t", "github": "alice_g"}
    },
    "active": true
  },
  "user2": {
    "id": 2,
    "name": "Bob",
    "profile": {
      "bio": "Product Manager",
      "social": {"twitter": "bob_t", "github": "bob_g"}
    },
    "active": false
  }
}
```

### Example 7: Escaped Values

```
(name,description)
item1:{Widget,"A , B, and C"}
item2:{Gadget,"Quote: \"Hello\""}
```

```json
{
  "item1": {"name": "Widget", "description": "A , B, and C"},
  "item2": {"name": "Gadget", "description": "Quote: \"Hello\""}
}
```

### Example 8: Empty Values, Null vs. Empty String

```
(name,email,phone)
user1:{Alice,,555-1234}
user2:{Bob,bob@example.com,null}
```

```json
{
  "user1": {"name": "Alice", "email": "",                    "phone": "555-1234"},
  "user2": {"name": "Bob",   "email": "bob@example.com",     "phone": null}
}
```

(Note `bob@example.com` is permitted because it appears inside a **quoted-or-escaped** position — but here it is a bare value beginning with `b`. The `@` is mid-value, not leading, so it is allowed.)

### Example 9: All Native Types

```
(string,integer,float,boolean,null_val)
example:{hello,42,3.14,true,null}
```

```json
{
  "example": {
    "string":   "hello",
    "integer":  42,
    "float":    3.14,
    "boolean":  true,
    "null_val": null
  }
}
```

### Example 10: Reserved-Character Leading Position Requires Quoting

```
(handle,note)
u1:{"@alice","email is alice@x.com"}
u2:{"#tag","\#literal-hash"}
```

```json
{
  "u1": {"handle": "@alice", "note": "email is alice@x.com"},
  "u2": {"handle": "#tag",   "note": "#literal-hash"}
}
```

A bare leading `@` or `#` is rejected; quote or escape it.

---

## Implementation Notes

A reference parser implementation has three stages:

1. **Tokenizer** — UTF-8 cursor scanner producing a token stream (parens, braces, brackets, colon, comma, newline, bare value, quoted string, array marker, EOF). Tokens carry line/column.
2. **Parser** — recursive-descent consumer of the token stream, producing the AST nodes defined in this spec (`XCONDocument`, `Header`, `Body`, `Row`, `Document`, `Array`, `Value`, `Label`).
3. **Evaluator** — walks the AST, applies the header schema, infers types on bare values, returns the final native object.

Errors **MUST** report:

- Line and column of the offending token (1-indexed).
- The token type or character that triggered the error.
- A human-readable message.

Reference error format:

```
[XCON ParseError at 2:5] Expected '}' but got ',' (in row 'user1')
```

---

## Versioning Policy

XCON v1.0 is **stable**. The text grammar, type inference rules, output semantics, and reserved-character set defined in this document are frozen and will be honored by all future v1.x parsers.

- **Backward compatibility (v1.x)** — every v1.0 document parses identically under all v1.x parsers.
- **Forward compatibility (v1.x → v1.0)** — v1.0 parsers will reject any v1.x document that uses syntax introduced after v1.0 (via the reserved-character mechanism or unknown `!`-directives), with a clear error.
- **Major version bump (v2.0)** — only a v2.0 may break v1.0 syntax, and only after a deprecation period.

---

## Appendix A: Common Patterns

### Optional Fields

```
(name,email,phone)
user1:{Alice,alice@example.com,null}
user2:{Bob,null,555-1234}
```

(`null` for missing values; not the empty string.)

### Empty Arrays

```
(name,tags[])
user1:{Alice,[]}
user2:{Bob,[admin,user]}
```

### Variable-Schema Rows (No Header)

```
{Alice,30}
{Bob,25,admin}
{Charlie,35,engineer,NYC}
```

Without a header, each row is an array; per-row arity may vary.

---

## Appendix B: Media Type

The recommended media type for XCON documents is `application/xcon`. A media type registration is planned. Until registration is complete, the unregistered type is informational only.

For HTTP content negotiation:

```
Accept: application/xcon, application/json;q=0.9
Content-Type: application/xcon; charset=utf-8
```

A `charset` parameter other than `utf-8` is ill-formed and SHOULD be rejected.
