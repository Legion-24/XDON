"""XCON - eXtensible Compact Object Notation parser and stringifier."""

from .parser import parse, parse_to_ast
from .stringifier import stringify
from .json_bridge import to_json, from_json
from .macro import expand, MacroContext, MacroDefinition, ExpandOptions
from .errors import XCONParseError, XCONStringifyError, XCONMacroError
from .ast_nodes import (
    XCONDocument,
    HeaderNode,
    LabelNode,
    BodyNode,
    RowNode,
    DocumentNode,
    ArrayNode,
    ValueNode,
)

__all__ = [
    'parse',
    'parse_to_ast',
    'stringify',
    'to_json',
    'from_json',
    'expand',
    'MacroContext',
    'MacroDefinition',
    'ExpandOptions',
    'XCONParseError',
    'XCONStringifyError',
    'XCONMacroError',
    'XCONDocument',
    'HeaderNode',
    'LabelNode',
    'BodyNode',
    'RowNode',
    'DocumentNode',
    'ArrayNode',
    'ValueNode',
]

__version__ = '0.1.0'
