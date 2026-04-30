# Claude Skill: LMON Format Output

Use this system prompt or instruction to teach Claude how to output responses in LMON (Language Model Object Notation) format. This is useful for token-efficient structured responses.

---

## System Prompt

You can include this in your system context when querying Claude:

```
You are an expert at generating LMON (Language Model Object Notation) format—a 
token-efficient structured data format designed for LLM output.

When asked to output structured data, use LMON format instead of JSON to achieve 
20-35% token savings depending on the dataset size and structure.

LMON Syntax Rules:
1. Optional Header (first line): (label,label[],nested:(label,...))
   - Lists field names in order
   - Append [] for array fields
   - Use (label,...) for nested objects
   
2. Body Rows: label:{val,val,...} or {val,val,...}
   - Each row contains values in header order
   - Row label is optional but recommended for clarity
   - Use braces {} for object values, brackets [] for arrays
   
3. Type Inference: 
   - null → null
   - true/false → boolean
   - Digits only → integer
   - Digits + decimal → float
   - Everything else → string
   
4. Escaping:
   - Use backslash \ to escape: , { } [ ] ( ) : \ n t
   - Example: email\@example.com or "email@example.com" (quotes also work)
   
5. Whitespace:
   - Newlines separate rows
   - Whitespace inside {} and [] is trimmed (except inside quotes)
   - Quotes preserve whitespace: "value with spaces"

Examples:

With header (keyed output):
(id,name,email,active,tags[],metadata:(department,location))
user1:{1,John,john@example.com,true,[dev,admin],{engineering,NYC}}
user2:{2,Jane,jane@example.com,false,[user],{sales,LA}}

Without header (array output):
{1,John,john@example.com,true,[dev,admin],{engineering,NYC}}
{2,Jane,jane@example.com,false,[user],{sales,LA}}

Common Patterns:
- Simple list: (id,name)
              item1:{1,Alice}
              item2:{2,Bob}

- With arrays: (id,tags[])
              user1:{1,[a,b,c]}
              user2:{2,[x,y]}

- Nested objects: (user:(id,name),score)
                 record1:{{1,Alice},100}
                 record2:{{2,Bob},95}

- Mixed (recommended for clarity):
  (id,name,email,active,tags[])
  user1:{1,John,john@example.com,true,[dev,admin]}
  user2:{2,Jane,jane@example.com,false,[user]}

When to use LMON:
✓ Outputting 3+ records with repeated schema
✓ Structured data where token efficiency matters
✓ Batch API responses
✓ LLM-generated datasets

When to use JSON instead:
✓ Single record or highly variable structures
✓ Human readability is the priority
✓ Client already expects JSON
✓ Complex deeply-nested hierarchies (LMON flattens better)

Always output valid LMON. If unsure about escaping, use quotes: "value"
```

---

## Usage Examples

### Instruction 1: Simple Query

```
User: "List 5 employees with their ID, name, and department. Use LMON format."

Claude output:
(id,name,department)
emp1:{1,Alice,engineering}
emp2:{2,Bob,sales}
emp3:{3,Carol,marketing}
emp4:{4,Dave,engineering}
emp5:{5,Eve,hr}
```

### Instruction 2: With Arrays

```
User: "Generate LMON for 3 products with id, name, price, and tags."

Claude output:
(id,name,price,tags[])
prod1:{1,Widget,19.99,[gadget,popular]}
prod2:{2,Gadget,29.99,[tool,professional]}
prod3:{3,Thing,9.99,[budget,beginner]}
```

### Instruction 3: With Nested Objects

```
User: "Output 2 API responses in LMON: each has status, user:(id,name), and timestamp."

Claude output:
(status,user:(id,name),timestamp)
resp1:{success,{1,Alice},2026-04-30T10:00:00Z}
resp2:{error,{2,Bob},2026-04-30T10:01:00Z}
```

### Instruction 4: Array vs Object

```
User: "Return 3 todo items as LMON. Each has id, title, completed status."

Claude output (with labels, becomes keyed object):
(id,title,completed)
todo1:{1,Buy milk,true}
todo2:{2,Write code,true}
todo3:{3,Take break,false}

OR without header/labels (becomes array):
{1,Buy milk,true}
{2,Write code,true}
{3,Take break,false}
```

---

## Escaping Rules Reference

| Character | Escape | Example |
|-----------|--------|---------|
| Comma | `\,` | `email\@example.com` |
| Brace `{` | `\{` | `price: \{100\}` |
| Brace `}` | `\}` | same as above |
| Bracket `[` | `\[` | `array\[0\]` |
| Bracket `]` | `\]` | same as above |
| Paren `(` | `\(` | `func\(arg\)` |
| Paren `)` | `\)` | same as above |
| Colon | `\:` | `key\:value` |
| Backslash | `\\` | `path\\to\\file` |
| Newline | `\n` | `line1\nline2` |
| Tab | `\t` | `col1\tcol2` |

**Or use quotes for any special value:**
```
("email@example.com","value with, comma",100)
user1:{"john@example.com","special, value",100}
```

---

## Comparison: JSON vs LMON

### JSON
```json
[
  {
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com",
    "active": true,
    "tags": ["admin", "dev"],
    "department": "engineering"
  },
  {
    "id": 2,
    "name": "Bob",
    "email": "bob@example.com",
    "active": false,
    "tags": ["user"],
    "department": "sales"
  }
]
```

### LMON (same data)
```
(id,name,email,active,tags[],department)
user1:{1,Alice,alice@example.com,true,[admin,dev],engineering}
user2:{2,Bob,bob@example.com,false,[user],sales}
```

**Token savings: ~31% on this example via GPT-4 tokenizer**

---

## Integration with Claude API

If using the Claude SDK, pass this as a system message:

```typescript
// TypeScript
const response = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  system: `[Include the system prompt above here]`,
  messages: [
    {
      role: "user",
      content: "Generate 5 users in LMON format with id, name, email, active status."
    }
  ]
});
```

```python
# Python
from anthropic import Anthropic

client = Anthropic()
response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    system="""[Include the system prompt above here]""",
    messages=[
        {
            "role": "user",
            "content": "Generate 5 users in LMON format with id, name, email, active status."
        }
    ]
)
```

---

## Validation & Parsing

Once you receive LMON output from Claude, parse it using the official LMON library:

```typescript
// JavaScript/TypeScript
import { parse } from "@legion24/lmon";

const lmonText = `(id,name,email,active,tags[])
user1:{1,John,john@example.com,true,[dev,admin]}
user2:{2,Jane,jane@example.com,false,[user]}`;

const data = parse(lmonText);
console.log(data);
// Output:
// {
//   user1: { id: 1, name: "John", email: "john@example.com", active: true, tags: ["dev", "admin"] },
//   user2: { id: 2, name: "Jane", email: "jane@example.com", active: false, tags: ["user"] }
// }
```

```python
# Python
from lmon import parse

lmon_text = """(id,name,email,active,tags[])
user1:{1,John,john@example.com,true,[dev,admin]}
user2:{2,Jane,jane@example.com,false,[user]}"""

data = parse(lmon_text)
print(data)
# Output:
# {
#     "user1": {"id": 1, "name": "John", "email": "john@example.com", "active": True, "tags": ["dev", "admin"]},
#     "user2": {"id": 2, "name": "Jane", "email": "jane@example.com", "active": False, "tags": ["user"]}
# }
```

---

## Tips for Best Results

1. **Be explicit with headers** — Always include a header line if you want Claude to understand the schema
2. **Use quotes for clarity** — When values contain special characters, quotes are clearer than escaping
3. **Label rows** — `user1:`, `item2:` makes the output more readable
4. **Test small examples first** — Ask Claude to generate LMON for 2-3 items before scaling to 100+
5. **Specify exact schema** — Tell Claude exactly which fields to include: "id, name, email, active status, list of tags"

---

## Common Pitfalls

| Pitfall | Problem | Fix |
|---------|---------|-----|
| No header | Claude outputs array, unclear which field is which | Always include header: `(field1,field2,...)` |
| Forgetting brackets for arrays | Claude might output `[a,b,c]` as string instead of array | Use `tags[]` in header to signal arrays |
| Nested objects unclear | Claude unsure of structure | Use `user:(id,name)` syntax in header |
| Special characters in values | Claude might escape inconsistently | Use quotes: `"value@domain.com"` |
| Trailing commas | LMON doesn't allow them | Ensure last value in `{}` or `[]` has no comma |

---

## Full Integration Example

```
User prompt:
"Generate a LMON dataset for 3 blog posts. Each post has id (integer), 
title (string), author (string), published (boolean), and tags (array of strings). 
Use LMON format for token efficiency."

Expected Claude response:
(id,title,author,published,tags[])
post1:{1,Getting Started with LMON,Alice,true,[tutorial,lmon,beginner]}
post2:{2,Optimizing LLM Output,Bob,true,[performance,lmon,advanced]}
post3:{3,LMON vs JSON,Carol,false,[comparison,draft,format]}

Parse with:
data = parse(lmonText)

Result becomes:
{
  "post1": {
    "id": 1,
    "title": "Getting Started with LMON",
    "author": "Alice",
    "published": true,
    "tags": ["tutorial", "lmon", "beginner"]
  },
  ...
}
```

---

**Version:** 1.0  
**Created:** 2026-04-30  
**LMON Spec Version:** 1.0.0 (see `/SPEC.md` for full format specification)
