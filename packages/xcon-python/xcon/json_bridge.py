import json
from typing import Any, Union, Dict

from .parser import parse, parse_to_ast
from .stringifier import stringify


def to_json(xcon: str) -> str:
    """Convert XCON to JSON string."""
    parsed = parse(xcon)
    return json.dumps(parsed)


def from_json(json_str: str) -> str:
    """Convert JSON string to XCON."""
    parsed = json.loads(json_str)
    return stringify(parsed)


__all__ = ['parse', 'parse_to_ast', 'stringify', 'to_json', 'from_json']
