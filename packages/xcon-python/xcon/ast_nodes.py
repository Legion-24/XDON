from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Union


@dataclass
class LabelNode:
    """Header label definition."""
    name: str = ""
    is_array: bool = False
    children: List["LabelNode"] = field(default_factory=list)
    type: str = "Label"


@dataclass
class HeaderNode:
    """Header section."""
    labels: List[LabelNode] = field(default_factory=list)
    type: str = "Header"


@dataclass
class ValueNode:
    """Scalar value."""
    raw: str = ""
    quoted: bool = False
    type: str = "Value"


@dataclass
class ArrayNode:
    """Array of values."""
    items: List[Union["ValueNode", "DocumentNode", "ArrayNode"]] = field(default_factory=list)
    type: str = "Array"


@dataclass
class DocumentNode:
    """Document with fields."""
    fields: List[Union[ValueNode, "DocumentNode", ArrayNode]] = field(default_factory=list)
    type: str = "Document"


@dataclass
class RowNode:
    """Row with optional label and document."""
    label: Optional[str] = None
    label_line: int = 0
    label_column: int = 0
    document: DocumentNode = field(default_factory=DocumentNode)
    type: str = "Row"


@dataclass
class BodyNode:
    """Body with rows."""
    rows: List[RowNode] = field(default_factory=list)
    type: str = "Body"


@dataclass
class XCONDocument:
    """Complete XCON document."""
    header: Optional[HeaderNode] = None
    body: BodyNode = field(default_factory=BodyNode)
    version_directive: Optional[str] = None
    type: str = "XCONDocument"


# Type alias for field values
FieldValueNode = Union[ValueNode, DocumentNode, ArrayNode]
