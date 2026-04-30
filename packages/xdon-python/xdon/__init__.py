"""XDON — eXtensible Compact Object Notation parser, stringifier, and JSON bridge."""

from .ast_nodes import (
    ArrayNode,
    BodyNode,
    DocumentNode,
    HeaderNode,
    LabelNode,
    RowNode,
    ValueNode,
    XDONDocument,
)
from .errors import XDONMacroError, XDONParseError, XDONStringifyError
from .json_bridge import from_json, to_json
from .macro import ExpandOptions, MacroContext, MacroDefinition, expand
from .parser import (
    DEFAULT_MAX_DEPTH,
    DEFAULT_MAX_LENGTH,
    DEFAULT_MAX_ROWS,
    ParseOptions,
    parse,
    parse_to_ast,
)
from .stringifier import stringify

VERSION = "1.0.0-beta.3"
__version__ = VERSION

__all__ = [
    "parse",
    "parse_to_ast",
    "ParseOptions",
    "stringify",
    "to_json",
    "from_json",
    "expand",
    "ExpandOptions",
    "MacroContext",
    "MacroDefinition",
    "XDONParseError",
    "XDONStringifyError",
    "XDONMacroError",
    "XDONDocument",
    "HeaderNode",
    "LabelNode",
    "BodyNode",
    "RowNode",
    "DocumentNode",
    "ArrayNode",
    "ValueNode",
    "DEFAULT_MAX_DEPTH",
    "DEFAULT_MAX_LENGTH",
    "DEFAULT_MAX_ROWS",
    "VERSION",
]
