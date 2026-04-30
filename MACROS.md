# XCON Text-Preprocessing Macros v1.0

XCON v1.0 ships with a text-level macro system — `%`-prefixed substitutions that run **before** the document is parsed. Macros enable templating, parameterized fragments, inline arithmetic, and access to a small set of built-in values.

> **Note.** Macros are an **opt-in preprocessing step**. They are not part of XCON's grammar; calling `parse(input)` on a document that contains macros will fail. Call `expand(input)` first, then `parse(expanded)`.

> **Decorator macros** (`@ref`, `@lazy`, `@fn`, `@sql`, `@rest`, `@cache`, `@macro`) are **planned** for a future XCON layer (XCON/decorators) and are **not implemented in v1.0**. The `@` character is reserved at the leading position of bare values to enable that future layer; see [SPEC.md § Reserved Characters](./SPEC.md#extensibility-and-reserved-characters).

---

## Quick Start

**TypeScript / JavaScript:**

```ts
import { expand, parse } from '@legion24/xcon';

const source = `
%header = "(name,age)"
%header
alice:{Alice,30}
`;

const expanded = expand(source);
const data = parse(expanded);
```

**Python:**

```python
from xcon import expand, parse

source = '''
%header = "(name,age)"
%header
alice:{Alice,30}
'''

expanded = expand(source)
data = parse(expanded)
```

---

## Syntax

### Definition Line

```
%name = "body"
%name(p1,p2) = "body with {p1} and {p2}"
```

- Must start with `%` followed by a valid identifier matching `[A-Za-z_][A-Za-z0-9_]*`.
- Names are **case-sensitive**: `%X` and `%x` are distinct macros.
- The body is a double-quoted string supporting `\"`, `\\`, `\n`, `\t` escapes.
- Definition lines are **consumed** during expansion — they do not appear in the output.

### Simple Reference

```
%greeting = "hello"
Say %greeting   →  Say hello
```

### Parameterized Reference

```
%greet(name) = "hello {name}"
%greet(Alice)   →  hello Alice
```

Placeholders use `{param}` syntax:

- May be repeated: `%dup(x) = "{x}-{x}"`, `%dup(foo)` → `foo-foo`
- Unused parameters are ignored.
- Arguments may contain spaces.
- Substitution is performed in a single left-to-right pass; placeholder names that are prefixes of other names do **not** corrupt later substitutions.

### Expression Macro

Inline arithmetic with `+`, `-`, `*`, `/`, `%` (modulo), parentheses, and unary minus:

```
%{2+3}        →  5
%{10/2}       →  5
%{10/4}       →  2.5
%{(2+3)*4}    →  20
%{-5+2}       →  -3
```

Type handling:

- An **integer-valued** result is rendered without a decimal point: `%{10/2}` → `5`.
- A **non-integer** result is rendered with all significant digits: `%{10/4}` → `2.5`.
- Macros may be referenced inside expressions: `%n = "5"`, `%{%n+10}` → `15`.

---

## Built-In Macros

Always available without definition. All built-ins are prefixed with `_` and are evaluated **per reference** — each `%_UUID` in the same document yields a fresh value.

| Macro | Returns | Example |
|-------|---------|---------|
| `%_DATE_STR` | ISO 8601 date | `2026-04-30` |
| `%_TIME_STR` | `HH:MM:SS` | `14:35:22` |
| `%_DATETIME_STR` | ISO 8601 datetime | `2026-04-30T14:35:22Z` |
| `%_TIMESTAMP` | Unix seconds | `1746057322` |
| `%_DAY_STR` | Day of week | `Wednesday` |
| `%_UUID` | UUID v4 | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| `%_ENV(VAR)` | Environment variable (when allowed) | `%_ENV(NODE_ENV)` |

### Built-in Override

A user macro definition with the same name as a built-in **shadows** the built-in for the rest of the document:

```
%_DATE_STR = "custom-date"
Date: %_DATE_STR    →  Date: custom-date
```

### Environment Variables

`%_ENV(VAR)` is **disabled by default** in v1.0. Reading process environment variables is opt-in for security: a document from an untrusted source could otherwise exfiltrate secrets via `%_ENV(AWS_SECRET_ACCESS_KEY)`.

Enable per-call with an explicit allowlist:

**TypeScript:**

```ts
expand(source, { envAllowlist: ['NODE_ENV', 'PORT'] });
// %_ENV(NODE_ENV) → 'production'
// %_ENV(SECRET)   → '' (not on allowlist)
```

**Python:**

```python
from xcon import expand, ExpandOptions
expand(source, ExpandOptions(env_allowlist=['NODE_ENV', 'PORT']))
```

If `envAllowlist` / `env_allowlist` is omitted or empty, `%_ENV(...)` always expands to the empty string. Setting `envAllowlist: '*'` (string) allows all environment variables; this is **not recommended** for documents from untrusted sources.

---

## Visibility

- **Forward references** are not allowed in strict mode. A macro is visible only after its definition line.
- **Initial context** can be supplied programmatically and is visible from line 1 (see [API Reference](#api-reference)).
- **Redefinition** overwrites the prior definition (last wins).

```
%x = "a"
%x = "b"
%x          →  b
```

---

## Nesting

A macro body may reference other macros:

```
%sep = ","
%row(a,b) = "{a}%sep{b}"
%row(x,y)   →  x,y
```

### Depth Limit

Expansion depth is limited to 16 by default to prevent runaway recursion. Direct or transitive cycles are detected as depth-exceeded errors:

```
%a = "%b"
%b = "%a"
%a          →  Error: Macro expansion depth exceeded
```

Increase the limit if needed (`maxDepth` / `max_depth` option), but most legitimate macros stay within depth 5.

---

## Strict Mode

By default (`strict: true`), unknown macros raise an error:

```
expand("%missing")           // throws XCONMacroError: Undefined macro 'missing'
```

In `strict: false`, unknown macros are left as-is so that downstream tooling may process them:

```
expand("%missing", { strict: false })   // returns "%missing"
```

Defined macros still expand; only unknown ones are passed through.

---

## Error Reporting

All macro errors carry line and column information:

```
[XCON MacroError at 2:5] Undefined macro 'missing'
```

Common errors:

| Error | Cause |
|-------|-------|
| `Undefined macro 'name'` | Used before definition (strict mode) |
| `Macro 'name' expects N arguments, got M` | Argument-count mismatch |
| `Macro 'name' takes no parameters, but M provided` | Simple macro called with args |
| `Unclosed parameter list for macro` | Missing `)` |
| `Unclosed expression macro %{...}` | Missing `}` |
| `Division by zero in expression` | `%{10/0}` |
| `Modulo by zero in expression` | `%{10%0}` |
| `Macro expansion depth exceeded` | Cycle or deep nesting |
| `Unexpected character in expression` | Non-arithmetic char inside `%{...}` |

---

## Practical Examples

### DRY Headers

```
%header = "(id,name,email,role,active)"

%header
emp1:{1,Alice,alice@example.com,admin,true}
emp2:{2,Bob,bob@example.com,user,false}
```

### Parameterized Rows

```
%emp(id,name,email,role) = "{id,name,email,role,true}"

(id,name,email,role,active)
emp1:%emp(1,Alice,alice@example.com,admin)
emp2:%emp(2,Bob,bob@example.com,user)
```

### Computed Values

```
%num = "100"
(value,doubled)
result:{%num,%{%num*2}}
```

Expanded:

```
(value,doubled)
result:{100,200}
```

### Environment-Driven Config

```ts
const expanded = expand(source, { envAllowlist: ['NODE_ENV'] });
```

```
(env,host,debug)
config:{%_ENV(NODE_ENV),localhost,false}
```

---

## API Reference

### TypeScript

```ts
import { expand, ExpandOptions, MacroDefinition } from '@legion24/xcon';

interface ExpandOptions {
  initialContext?: MacroContext;       // pre-defined macros visible from line 1
  strict?: boolean;                    // default: true
  maxDepth?: number;                   // default: 16
  envAllowlist?: string[] | '*';       // default: [] (no env access)
}

interface MacroDefinition {
  body: string;
  params: string[] | null;
  sourceLine: number;
}

type MacroContext = Map<string, MacroDefinition>;

function expand(input: string, options?: ExpandOptions): string;
```

### Python

```python
from xcon import expand, ExpandOptions, MacroDefinition
from typing import Optional

@dataclass
class ExpandOptions:
    initial_context: Optional[dict[str, MacroDefinition]] = None
    strict: bool = True
    max_depth: int = 16
    env_allowlist: list[str] | str | None = None  # default: no env access; '*' for all

@dataclass
class MacroDefinition:
    body: str
    params: Optional[list[str]]
    source_line: int

def expand(input_text: str, options: Optional[ExpandOptions] = None) -> str: ...
```

---

## Design Decisions

### Why text-level?

Macros operate on raw text before tokenization. This keeps the macro layer fully decoupled from XCON's grammar — the same engine can preprocess any text format.

### Why positional parameters?

Positional parameters are simpler and more efficient than named parameters and match conventions familiar from C macros, shell `$1`, and templating systems.

### Why no variable assignment?

Macros are functional — each expansion is a pure function of its arguments and context. Mutable variables would complicate caching, ordering, and reasoning. Use `initialContext` to inject values at call time.

### Why per-reference `%_UUID`?

A document author may write `id:%_UUID,backup_id:%_UUID` and expect two distinct UUIDs. Built-ins are evaluated each time they are referenced, not once per `expand()` call.

### Why is `%_ENV` opt-in?

`%_ENV` reads process environment variables, including secrets. Allowing it by default would mean any XCON document from an untrusted source could exfiltrate secrets. v1.0 requires explicit opt-in via an allowlist.

---

## FAQ

**Q: Can macro definitions span multiple lines?**
A: No. Definition lines are single-line. Use `\n` inside the body string to embed newlines: `%x = "line1\nline2"`.

**Q: Can I nest parameterized calls?**
A: Yes. `%f(%g(x))` works if both are defined.

**Q: What if a macro definition is malformed?**
A: Malformed definitions (missing quotes, unclosed parens) are not recognized as definitions; the line is treated as content. In strict mode, any `%name` reference on that line will then raise `Undefined macro`.

**Q: Can I use macros in macro names?**
A: No. Macro names are fixed identifiers; only bodies and arguments are expanded.

**Q: Are macros guaranteed to terminate?**
A: Yes — the `maxDepth` cap prevents infinite recursion. Cycles raise `Macro expansion depth exceeded`.

---

## See Also

- [SPEC.md](./SPEC.md) — XCON v1.0 text format specification
- [README.md](./README.md) — quick start and overview
