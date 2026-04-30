from typing import Any, Dict, List, Optional


def stringify(obj: Any) -> str:
    """Convert Python object to XCON string."""
    if isinstance(obj, list):
        return stringify_array(obj)
    elif isinstance(obj, dict):
        return stringify_object(obj)
    else:
        return stringify_array([obj])


def stringify_array(arr: list) -> str:
    """Stringify a list."""
    if not arr:
        return ""

    first = arr[0] if arr else None

    # Infer schema from first element
    if isinstance(first, dict):
        schema = infer_schema_from_object(first)
        header_line = format_header(schema)

        rows = "\n".join(
            format_document(item, schema) for item in arr
        )

        return f"{header_line}\n{rows}" if header_line else rows

    # Array of arrays (no header)
    if isinstance(first, list):
        rows = "\n".join(
            format_document(item, []) for item in arr
        )
        return rows

    # Array of scalars
    doc_str = format_document(arr, [])
    return doc_str


def stringify_object(obj: Dict[str, Any]) -> str:
    """Stringify a dict."""
    if not obj:
        return ""

    first_value = next(iter(obj.values())) if obj else None

    # Infer schema from first value
    if isinstance(first_value, dict):
        schema = infer_schema_from_object(first_value)
        header_line = format_header(schema)

        rows = "\n".join(
            f"{key}:{format_document(value, schema)}"
            for key, value in obj.items()
        )

        return f"{header_line}\n{rows}" if header_line else rows

    # Simple object with scalar values
    schema = infer_schema_from_object(obj)
    header_line = format_header(schema)

    rows = "\n".join(
        f"{key}:{format_document(value, schema)}"
        for key, value in obj.items()
    )

    return f"{header_line}\n{rows}" if header_line else rows


def infer_schema_from_object(obj: Any) -> List[Dict[str, Any]]:
    """Infer schema from an object."""
    if not isinstance(obj, dict):
        return []

    schema = []
    for key, value in obj.items():
        is_array = isinstance(value, list)
        children = (
            infer_schema_from_object(value)
            if isinstance(value, dict)
            else []
        )

        schema.append({
            'name': key,
            'is_array': is_array,
            'children': children,
        })

    return schema


def format_header(schema: List[Dict[str, Any]]) -> str:
    """Format schema as XCON header."""
    if not schema:
        return ""

    labels = []
    for s in schema:
        array_marker = "[]" if s['is_array'] else ""
        if s['children']:
            nested_labels = ",".join(c['name'] for c in s['children'])
            labels.append(f"{s['name']}:({nested_labels})")
        else:
            labels.append(f"{s['name']}{array_marker}")

    return f"({','.join(labels)})"


def format_document(value: Any, schema: List[Dict[str, Any]]) -> str:
    """Format a value as a XCON document."""
    if isinstance(value, list):
        items = [format_value(v) for v in value]
        return "{" + ",".join(items) + "}"

    if isinstance(value, dict):
        items = [format_value(v) for v in value.values()]
        return "{" + ",".join(items) + "}"

    return "{" + format_value(value) + "}"


def format_value(value: Any) -> str:
    """Format a value."""
    if value is None:
        return "null"

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, list):
        items = [format_value(v) for v in value]
        return "[" + ",".join(items) + "]"

    if isinstance(value, dict):
        items = [format_value(v) for v in value.values()]
        return "{" + ",".join(items) + "}"

    # String - may need quoting
    s = str(value)
    if needs_quoting(s):
        return '"' + escape_string(s) + '"'
    return s


def needs_quoting(s: str) -> bool:
    """Check if a string needs quoting."""
    if s == "":
        return False
    if " " in s:
        return True
    if '"' in s or "'" in s:
        return True
    if any(c in s for c in ",{}[]:\\"):
        return True
    return False


def escape_string(s: str) -> str:
    """Escape special characters in a string."""
    s = s.replace("\\", "\\\\")
    s = s.replace('"', '\\"')
    s = s.replace("\n", "\\n")
    s = s.replace("\t", "\\t")
    return s
