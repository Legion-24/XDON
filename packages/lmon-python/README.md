# LMON - Language Model Object Notation (Python)

Token-efficient structured data format for LLM output.

## Installation

```bash
pip install lmon
```

## Quick Start

### Parsing LMON

```python
from lmon import parse

lmon_text = """(name,age,active)
alice:{Alice,30,true}
bob:{Bob,25,false}"""

result = parse(lmon_text)
# {
#   'alice': {'name': 'Alice', 'age': 30, 'active': True},
#   'bob': {'name': 'Bob', 'age': 25, 'active': False}
# }
```

### Stringifying to LMON

```python
from lmon import stringify

obj = {
    'user1': {'name': 'Alice', 'age': 30},
    'user2': {'name': 'Bob', 'age': 25}
}

lmon = stringify(obj)
# (name,age)
# user1:{Alice,30}
# user2:{Bob,25}
```

### JSON Conversion

```python
from lmon import to_json, from_json

# LMON to JSON
lmon_str = '(name)\nalice:{Alice}'
json_str = to_json(lmon_str)

# JSON to LMON
json_str = '{"user1": {"name": "Alice"}}'
lmon_str = from_json(json_str)
```

## Format Overview

LMON has two optional parts:

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

### parse(lmon: str) → Union[Dict, List]

Parse LMON text to Python object.

### parse_to_ast(lmon: str) → LMONDocument

Parse LMON text to AST (advanced usage).

### stringify(obj: Union[Dict, List]) → str

Convert Python object to LMON text.

### to_json(lmon: str) → str

Convert LMON to JSON string.

### from_json(json_str: str) → str

Convert JSON string to LMON.

## Errors

### LMONParseError

Raised on parse errors with line/column information.

### LMONStringifyError

Raised on stringification errors.

## Testing

```bash
pytest tests/
pytest tests/ --cov=lmon
```

## See Also

- [SPEC.md](../../SPEC.md) - Formal LMON specification
- [JS/TS implementation](../lmon/) - TypeScript reference implementation
