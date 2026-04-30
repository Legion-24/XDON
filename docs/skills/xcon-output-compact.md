---
name: XCON Output (Compact)
description: Token-efficient structured response format with 20-35% savings vs JSON
type: skill
tags: [xcon, token-efficiency, structured-data]
---

# XCON Output (Compact)

Output XCON format (eXtensible Compact Object Notation) — schema-ambient compact data, 30–40% smaller than JSON in text and up to 72% smaller in BXCON binary.

## Syntax

**Header:** `(label,label[],nested:(label,...))`
**Body:** `label:{val,val,...}` or `{val,val,...}`

### Rules

1. Header defines field schema (optional but recommended)
2. `[]` suffix = array field
3. `(...)` = nested object
4. Row labels optional, values in header order
5. Type inference: null, true/false, digits, floats, strings
6. Escape special chars with `\` or use quotes: `"value"`

### Common Patterns

```
(id,name,email,active,tags[])
user1:{1,John,john@example.com,true,[dev,admin]}
user2:{2,Jane,jane@example.com,false,[user]}
```

```
(id,user:(id,name),status)
resp1:{1,{1,Alice},success}
resp2:{2,{2,Bob},error}
```

## Escaping

Special chars: `,{}[]():\ n t` → use `\` prefix or quotes
```
"email@example.com"  or  email\@example.com
```

## When to Use XCON

✓ 3+ records with same schema  
✓ Structured data where token savings matter  
✓ Batch responses  

✗ Single record  
✗ Highly variable structure  
✗ Human readability priority  

## Savings

20-35% token reduction vs JSON (depends on structure).

Example: 2 users (5 fields each)
- JSON: 151 tokens
- XCON: 104 tokens (~31% savings)

## Tips

- Always include header
- Use quotes for clarity on special chars
- Label rows for readability
- Specify exact schema in prompt
- Test with 2-3 items first
