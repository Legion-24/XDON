import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from .errors import XCONStringifyError

_RESERVED_LEADING = frozenset({"@", "#", "!", "%"})
_BARE_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_INT_RE = re.compile(r"^-?\d+$")
_FLOAT_RE = re.compile(r"^-?\d+\.\d+$")
_SPECIAL_CHARS_RE = re.compile(r'[,{}\[\]:()\\\n\t" \']')


@dataclass
class _SchemaField:
    name: str
    is_array: bool = False
    children: List["_SchemaField"] = field(default_factory=list)


def stringify(obj: Any, row_labels: bool = True) -> str:
    """Convert a Python object to XCON text."""
    seen: Set[int] = set()
    if isinstance(obj, list):
        return _stringify_array(obj, seen)
    if isinstance(obj, dict):
        return _stringify_object(obj, row_labels, seen)
    return "{" + _format_scalar(obj, seen) + "}"


def _stringify_array(arr: List[Any], seen: Set[int]) -> str:
    if not arr:
        return ""

    all_objects = all(
        isinstance(x, dict) for x in arr
    )

    if all_objects and arr:
        schema = _infer_schema_union(arr)
        if not schema:
            return "\n".join("{}" for _ in arr)
        header_line = _format_header(schema)
        rows = "\n".join(_format_document_by_schema(item, schema, seen) for item in arr)
        return f"{header_line}\n{rows}"

    rows = "\n".join(_format_row_schemaless(item, seen) for item in arr)
    return rows


def _stringify_object(obj: Dict[str, Any], row_labels: bool, seen: Set[int]) -> str:
    if id(obj) in seen:
        raise XCONStringifyError("Cyclic reference in input")
    seen.add(id(obj))

    entries = list(obj.items())
    if not entries:
        seen.discard(id(obj))
        return ""

    all_values_objects = all(isinstance(v, dict) for _, v in entries)

    if row_labels and all_values_objects:
        objects = [v for _, v in entries]
        schema = _infer_schema_union(objects)
        if not schema:
            seen.discard(id(obj))
            return "\n".join(f"{_format_row_label(k)}:{{}}" for k, _ in entries)
        header_line = _format_header(schema)
        rows = "\n".join(
            f"{_format_row_label(k)}:{_format_document_by_schema(v, schema, seen)}"
            for k, v in entries
        )
        seen.discard(id(obj))
        return f"{header_line}\n{rows}"

    if row_labels:
        rows = "\n".join(
            f"{_format_row_label(k)}:{_format_row_schemaless(v, seen)}"
            for k, v in entries
        )
        seen.discard(id(obj))
        return rows

    schema = _infer_schema(obj)
    header_line = _format_header(schema)
    row = _format_document_by_schema(obj, schema, seen)
    seen.discard(id(obj))
    return f"{header_line}\n{row}" if header_line else row


def _format_row_label(key: str) -> str:
    if not key:
        return '""'
    if _BARE_IDENT_RE.match(key) and key[0] not in _RESERVED_LEADING:
        return key
    return '"' + _escape_quoted(key) + '"'


def _infer_schema(obj: Dict[str, Any], seen: Optional[Set[int]] = None) -> List[_SchemaField]:
    if seen is None:
        seen = set()
    if id(obj) in seen:
        raise XCONStringifyError("Cyclic reference in input")
    seen.add(id(obj))
    try:
        return [_build_field(name, value, seen) for name, value in obj.items()]
    finally:
        seen.discard(id(obj))


def _infer_schema_union(objects: List[Any], seen: Optional[Set[int]] = None) -> List[_SchemaField]:
    if seen is None:
        seen = set()
    order: List[str] = []
    fields: Dict[str, _SchemaField] = {}
    for o in objects:
        if not isinstance(o, dict):
            continue
        if id(o) in seen:
            raise XCONStringifyError("Cyclic reference in input")
        seen.add(id(o))
        try:
            for name, value in o.items():
                if name not in fields:
                    order.append(name)
                    fields[name] = _build_field(name, value, seen)
                else:
                    ex = fields[name]
                    cand = _build_field(name, value, seen)
                    if not ex.is_array and cand.is_array:
                        ex.is_array = True
                    if not ex.children and cand.children:
                        ex.children = cand.children
                    elif ex.children and cand.children:
                        ex.children = _merge_fields(ex.children, cand.children)
        finally:
            seen.discard(id(o))
    return [fields[n] for n in order]


def _build_field(name: str, value: Any, seen: Optional[Set[int]] = None) -> _SchemaField:
    if seen is None:
        seen = set()
    if isinstance(value, list):
        objs = [v for v in value if isinstance(v, dict)]
        if objs:
            return _SchemaField(name=name, is_array=True, children=_infer_schema_union(objs, seen))
        return _SchemaField(name=name, is_array=True, children=[])
    if isinstance(value, dict):
        return _SchemaField(name=name, is_array=False, children=_infer_schema(value, seen))
    return _SchemaField(name=name, is_array=False, children=[])


def _merge_fields(a: List[_SchemaField], b: List[_SchemaField]) -> List[_SchemaField]:
    order: List[str] = []
    table: Dict[str, _SchemaField] = {}
    for f in a:
        order.append(f.name)
        table[f.name] = _SchemaField(name=f.name, is_array=f.is_array, children=list(f.children))
    for f in b:
        if f.name not in table:
            order.append(f.name)
            table[f.name] = _SchemaField(name=f.name, is_array=f.is_array, children=list(f.children))
        else:
            ex = table[f.name]
            if not ex.is_array and f.is_array:
                ex.is_array = True
            if not ex.children and f.children:
                ex.children = f.children
            elif ex.children and f.children:
                ex.children = _merge_fields(ex.children, f.children)
    return [table[n] for n in order]


def _format_header(schema: List[_SchemaField]) -> str:
    return "(" + ",".join(_format_label(f) for f in schema) + ")"


def _format_label(f: _SchemaField) -> str:
    name = (
        f.name
        if _BARE_IDENT_RE.match(f.name) and f.name[0] not in _RESERVED_LEADING
        else '"' + _escape_quoted(f.name) + '"'
    )
    if f.children and f.is_array:
        return f"{name}[]:({','.join(_format_label(c) for c in f.children)})"
    if f.children:
        return f"{name}:({','.join(_format_label(c) for c in f.children)})"
    if f.is_array:
        return f"{name}[]"
    return name


def _format_document_by_schema(
    obj: Dict[str, Any], schema: List[_SchemaField], seen: Set[int]
) -> str:
    if not isinstance(obj, dict):
        raise XCONStringifyError(
            "Schema-based formatter requires a dict input"
        )
    if id(obj) in seen:
        raise XCONStringifyError("Cyclic reference in input")
    seen.add(id(obj))
    parts: List[str] = []
    try:
        for fld in schema:
            if fld.name not in obj:
                parts.append("[]" if fld.is_array else "null")
                continue
            value = obj[fld.name]
            if fld.is_array:
                if not isinstance(value, list):
                    raise XCONStringifyError(
                        f"Field '{fld.name}' declared as array but value is not a list"
                    )
                if fld.children:
                    inner: List[str] = []
                    for item in value:
                        if not isinstance(item, dict):
                            raise XCONStringifyError(
                                f"Field '{fld.name}' declared as array of objects but item is not a dict"
                            )
                        inner.append(_format_document_by_schema(item, fld.children, seen))
                    parts.append("[" + ",".join(inner) + "]")
                else:
                    parts.append("[" + ",".join(_format_scalar(v, seen) for v in value) + "]")
            elif fld.children:
                if not isinstance(value, dict):
                    raise XCONStringifyError(
                        f"Field '{fld.name}' declared as nested document but value is not a dict"
                    )
                parts.append(_format_document_by_schema(value, fld.children, seen))
            else:
                parts.append(_format_scalar(value, seen))
    finally:
        seen.discard(id(obj))
    return "{" + ",".join(parts) + "}"


def _format_row_schemaless(value: Any, seen: Set[int]) -> str:
    if isinstance(value, list):
        return "{" + ",".join(_format_scalar(v, seen) for v in value) + "}"
    if isinstance(value, dict):
        if id(value) in seen:
            raise XCONStringifyError("Cyclic reference in input")
        seen.add(id(value))
        try:
            inner = ",".join(_format_scalar(v, seen) for v in value.values())
        finally:
            seen.discard(id(value))
        return "{" + inner + "}"
    return "{" + _format_scalar(value, seen) + "}"


def _format_scalar(value: Any, seen: Set[int]) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if math.isfinite(value):
            return str(value)
        return '"' + str(value) + '"'
    if isinstance(value, list):
        return "[" + ",".join(_format_scalar(v, seen) for v in value) + "]"
    if isinstance(value, dict):
        if id(value) in seen:
            raise XCONStringifyError("Cyclic reference in input")
        seen.add(id(value))
        try:
            inner = ",".join(_format_scalar(v, seen) for v in value.values())
        finally:
            seen.discard(id(value))
        return "{" + inner + "}"
    if isinstance(value, str):
        return _format_string(value)
    raise XCONStringifyError(f"Unsupported value type: {type(value).__name__}")


def _format_string(s: str) -> str:
    if s == "":
        return '""'
    if s in ("null", "true", "false"):
        return '"' + s + '"'
    if _INT_RE.fullmatch(s) or _FLOAT_RE.fullmatch(s):
        return '"' + s + '"'
    if s[0] in _RESERVED_LEADING:
        return '"' + _escape_quoted(s) + '"'
    if _SPECIAL_CHARS_RE.search(s):
        return '"' + _escape_quoted(s) + '"'
    return s


def _escape_quoted(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\t", "\\t")
    )
