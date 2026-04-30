# xcon — Python

XCON parser and stringifier for Python. Includes optional macro preprocessing.

---

## Installation

```bash
pip install xcon
```

Requires Python 3.10+.

---

## Quick Start

### Parsing XCON

```python
from xcon import parse

xcon_text = """(name,age,active)
alice:{Alice,30,true}
bob:{Bob,25,false}"""

result = parse(xcon_text)
# {
#   'alice': {'name': 'Alice', 'age': 30, 'active': True},
#   'bob': {'name': 'Bob', 'age': 25, 'active': False}
# }
```

### Stringifying to XCON

```python
from xcon import stringify

obj = {
    'user1': {'name': 'Alice', 'age': 30},
    'user2': {'name': 'Bob', 'age': 25}
}

xcon = stringify(obj)
# (name,age)
# user1:{Alice,30}
# user2:{Bob,25}
```

### Macros (Preprocessing)

Use macros to reduce repetition and add dynamic values:

```python
from xcon import expand, parse

xcon_with_macros = """
%header = "(id,name,email)"
%admin = "true"

%header
emp1:{1,Alice,alice@example.com,%admin}
emp2:{2,Bob,bob@example.com,false}
"""

expanded = expand(xcon_with_macros)
data = parse(expanded)
```

**Macro features:**
- **Simple macros** — `%name = "value"` defines a variable, `%name` expands it
- **Parameterized macros** — `%row(a,b) = "{a},{b}"` with `%row(x,y)` expanding
- **Expression macros** — `%{2+3*4}` evaluates arithmetic (14)
- **Built-in macros** — `%_DATE_STR`, `%_TIME_STR`, `%_UUID`, `%_ENV(VAR)`, etc.

See [MACROS.md](../../MACROS.md) for full documentation.

### JSON Conversion

```python
from xcon import to_json, from_json

# XCON to JSON
xcon_str = '(name)\nalice:{Alice}'
json_str = to_json(xcon_str)

# JSON to XCON
json_str = '{"user1": {"name": "Alice"}}'
xcon_str = from_json(json_str)
```

---

## Format Overview

XCON has two optional parts:

1. **Header** (optional): Defines structure
   ```
   (field1,field2[],nested:(subfield1,subfield2))
   ```

2. **Body**: Data rows
   ```
   row_label:{value1,[array,items],{nested,object}}
   ```

### Complete Example

```
(name,tags[],address:(city,zip))
alice:{Alice,[admin,dev],{NYC,10001}}
bob:{Bob,[user],{LA,90001}}
```

Parse result:
```python
{
    'alice': {
        'name': 'Alice',
        'tags': ['admin', 'dev'],
        'address': {'city': 'NYC', 'zip': '10001'}
    },
    'bob': {
        'name': 'Bob',
        'tags': ['user'],
        'address': {'city': 'LA', 'zip': '90001'}
    }
}
```

## Type Inference

Values are automatically typed:

- `null` → None
- `true`, `false` → bool
- `123` → int
- `3.14` → float
- `hello` → str

## API Reference

### Parsing

#### `parse(input: str, options: Optional[ParseOptions] = None) -> Any`

Parse XCON text to Python object.

```python
from xcon import parse

data = parse(xcon_text)
```

#### `parse_to_ast(input: str) -> XCONDocument`

Parse XCON text to AST (for advanced usage).

### Stringification

#### `stringify(data: Any, options: Optional[StringifyOptions] = None) -> str`

Convert Python object to XCON text.

```python
from xcon import stringify

xcon = stringify(data)
```

### Macros

#### `expand(input_text: str, options: Optional[ExpandOptions] = None) -> str`

Expand macros in XCON text (preprocessing step).

```python
from xcon import expand, ExpandOptions

expanded = expand(xcon_with_macros, ExpandOptions(strict=True, max_depth=16))
```

**Options:**
- `initial_context` — Pre-defined macros visible from line 1
- `strict` — If `True` (default), undefined macros throw an error
- `max_depth` — Maximum nesting depth (default 16)

### JSON Bridge

#### `to_json(xcon: str) -> str`

Convert XCON to JSON string.

#### `from_json(json_str: str) -> str`

Convert JSON string to XCON.

---

## Error Handling

Exceptions include line/column information for debugging:

```python
from xcon import parse, expand
from xcon.errors import XCONParseError, XCONMacroError

try:
    data = parse(malformed)
except XCONParseError as err:
    print(f"Parse error at {err.line}:{err.column}: {err.message}")

try:
    expanded = expand(xcon_with_macros)
except XCONMacroError as err:
    print(f"Macro error at {err.line}:{err.column}: {err.message}")
```

### XCONParseError

Raised on XCON syntax errors with line/column information.

### XCONMacroError

Raised on macro expansion errors (undefined macro, circular reference, etc.).

### XCONStringifyError

Raised on stringification errors.

## Testing

```bash
pytest tests/
pytest tests/ --cov=xcon
```

## See Also

- [SPEC.md](../../SPEC.md) - Formal XCON specification
- [JS/TS implementation](../xcon/) - TypeScript reference implementation
