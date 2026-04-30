from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Union, Any


@dataclass
class LabelNode:
    """Header label definition."""
    type: str = "Label"
    name: str = ""
    is_array: bool = False
    children: List['LabelNode'] = None

    def __post_init__(self) -> None:
        if self.children is None:
            self.children = []


@dataclass
class HeaderNode:
    """Header section."""
    type: str = "Header"
    labels: List[LabelNode] = None

    def __post_init__(self) -> None:
        if self.labels is None:
            self.labels = []


@dataclass
class ValueNode:
    """Scalar value."""
    type: str = "Value"
    raw: str = ""


@dataclass
class ArrayNode:
    """Array of values."""
    type: str = "Array"
    items: List[Union['ValueNode', 'DocumentNode', 'ArrayNode']] = None

    def __post_init__(self) -> None:
        if self.items is None:
            self.items = []


@dataclass
class DocumentNode:
    """Document with fields."""
    type: str = "Document"
    fields: List[Union[ValueNode, 'DocumentNode', ArrayNode]] = None

    def __post_init__(self) -> None:
        if self.fields is None:
            self.fields = []


@dataclass
class RowNode:
    """Row with optional label and document."""
    type: str = "Row"
    label: Optional[str] = None
    document: DocumentNode = None

    def __post_init__(self) -> None:
        if self.document is None:
            self.document = DocumentNode()


@dataclass
class BodyNode:
    """Body with rows."""
    type: str = "Body"
    rows: List[RowNode] = None

    def __post_init__(self) -> None:
        if self.rows is None:
            self.rows = []


@dataclass
class XCONDocument:
    """Complete XCON document."""
    type: str = "XCONDocument"
    header: Optional[HeaderNode] = None
    body: BodyNode = None

    def __post_init__(self) -> None:
        if self.body is None:
            self.body = BodyNode()


# Type alias for field values
FieldValueNode = Union[ValueNode, DocumentNode, ArrayNode]
