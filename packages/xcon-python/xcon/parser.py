import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union

from .ast_nodes import (
    ArrayNode,
    BodyNode,
    DocumentNode,
    FieldValueNode,
    HeaderNode,
    LabelNode,
    RowNode,
    ValueNode,
    XCONDocument,
)
from .errors import XCONParseError
from .evaluator import infer_type
from .tokenizer import Token, TokenType, tokenize

DEFAULT_MAX_DEPTH = 64
DEFAULT_MAX_LENGTH = 16 * 1024 * 1024
DEFAULT_MAX_ROWS = 1_000_000

_VERSION_DIRECTIVE_RE = re.compile(r"^!XCON\s+(\d+)\.(\d+)\s*$")
_SUPPORTED_MAJOR = 1


@dataclass
class ParseOptions:
    """Options controlling parser limits."""
    max_depth: int = DEFAULT_MAX_DEPTH
    max_length: int = DEFAULT_MAX_LENGTH
    max_rows: int = DEFAULT_MAX_ROWS


class Parser:
    """Recursive descent parser for XCON."""

    def __init__(self, tokens: List[Token], max_depth: int, max_rows: int) -> None:
        self.tokens = tokens
        self.pos = 0
        self.max_depth = max_depth
        self.max_rows = max_rows

    def current(self) -> Token:
        return self.tokens[self.pos]

    def peek(self, offset: int = 1) -> Optional[Token]:
        pos = self.pos + offset
        return self.tokens[pos] if pos < len(self.tokens) else None

    def advance(self) -> Token:
        token = self.tokens[self.pos]
        self.pos += 1
        return token

    def expect(self, token_type: TokenType, hint: Optional[str] = None) -> Token:
        token = self.current()
        if token.type != token_type:
            label = hint or token_type.value
            seen = (
                "end of input"
                if token.type == TokenType.EOF
                else f"{token.type.value}"
                + (f" ('{token.value}')" if token.value else "")
            )
            raise XCONParseError(
                f"Expected {label} but got {seen}",
                token.line,
                token.column,
            )
        return self.advance()

    def skip_newlines(self) -> None:
        while self.current().type == TokenType.NEWLINE:
            self.advance()

    def parse(self) -> XCONDocument:
        self.skip_newlines()

        version_directive: Optional[str] = None
        if self.current().type == TokenType.DIRECTIVE:
            version_directive = self.parse_directive()
            self.skip_newlines()

        header: Optional[HeaderNode] = None
        if self.current().type == TokenType.LPAREN:
            header = self.parse_header()
            self.skip_newlines()

        body = self.parse_body()
        return XCONDocument(header=header, body=body, version_directive=version_directive)

    def parse_directive(self) -> str:
        tok = self.advance()
        directive = tok.value.strip()
        m = _VERSION_DIRECTIVE_RE.match(directive)
        if not m:
            raise XCONParseError(
                f"Unknown directive: '{directive}'",
                tok.line,
                tok.column,
            )
        major = int(m.group(1))
        if major != _SUPPORTED_MAJOR:
            raise XCONParseError(
                f"Unsupported XCON version '{m.group(1)}.{m.group(2)}' — "
                f"this parser supports v{_SUPPORTED_MAJOR}.x",
                tok.line,
                tok.column,
            )
        return directive

    def parse_header(self) -> HeaderNode:
        self.expect(TokenType.LPAREN, "(")
        labels = self.parse_label_list()
        self.expect(TokenType.RPAREN, ")")
        return HeaderNode(labels=labels)

    def parse_label_list(self) -> List[LabelNode]:
        labels: List[LabelNode] = [self.parse_label()]
        while self.current().type == TokenType.COMMA:
            self.advance()
            if self.current().type == TokenType.RPAREN:
                raise XCONParseError(
                    "Trailing comma not allowed in header",
                    self.current().line,
                    self.current().column,
                )
            labels.append(self.parse_label())
        return labels

    def parse_label(self) -> LabelNode:
        tok = self.current()
        if tok.type not in (TokenType.LABEL_OR_VALUE, TokenType.QUOTED_STRING):
            raise XCONParseError(
                f"Expected label name but got {tok.type.value}",
                tok.line,
                tok.column,
            )
        self.advance()

        is_array = False
        children: List[LabelNode] = []

        if self.current().type == TokenType.ARRAY_MARKER:
            self.advance()
            is_array = True

        if self.current().type == TokenType.COLON:
            self.advance()
            self.expect(TokenType.LPAREN, "( for nested schema")
            children = self.parse_label_list()
            self.expect(TokenType.RPAREN, ")")

        return LabelNode(name=tok.value, is_array=is_array, children=children)

    def parse_body(self) -> BodyNode:
        rows: List[RowNode] = []
        while self.current().type != TokenType.EOF:
            self.skip_newlines()
            if self.current().type == TokenType.EOF:
                break
            if len(rows) >= self.max_rows:
                raise XCONParseError(
                    f"Document exceeds maxRows limit ({self.max_rows})",
                    self.current().line,
                    self.current().column,
                )
            rows.append(self.parse_row())
            self.skip_newlines()
        return BodyNode(rows=rows)

    def parse_row(self) -> RowNode:
        label: Optional[str] = None
        label_line = self.current().line
        label_column = self.current().column

        next_tok = self.peek()
        if (
            self.current().type in (TokenType.LABEL_OR_VALUE, TokenType.QUOTED_STRING)
            and next_tok is not None
            and next_tok.type == TokenType.COLON
        ):
            label_tok = self.advance()
            label = label_tok.value
            label_line = label_tok.line
            label_column = label_tok.column
            self.expect(TokenType.COLON, ":")

        if self.current().type == TokenType.LBRACE:
            document = self.parse_document(0)
        elif self.current().type == TokenType.LBRACKET:
            arr = self.parse_array(0)
            document = DocumentNode(fields=[arr])
        else:
            tok = self.current()
            seen = (
                "end of input"
                if tok.type == TokenType.EOF
                else f"{tok.type.value}"
                + (f" ('{tok.value}')" if tok.value else "")
            )
            raise XCONParseError(
                f"Expected row body '{{' but got {seen}",
                tok.line,
                tok.column,
            )

        return RowNode(
            label=label,
            label_line=label_line,
            label_column=label_column,
            document=document,
        )

    def parse_document(self, depth: int) -> DocumentNode:
        if depth >= self.max_depth:
            tok = self.current()
            raise XCONParseError(
                f"Document nesting depth exceeds maxDepth ({self.max_depth})",
                tok.line,
                tok.column,
            )
        self.expect(TokenType.LBRACE, "{")

        fields: List[FieldValueNode] = []
        while self.current().type != TokenType.RBRACE:
            if self.current().type == TokenType.EOF:
                raise XCONParseError(
                    "Unexpected end of input — expected '}' to close document",
                    self.current().line,
                    self.current().column,
                )
            fields.append(self.parse_field_value(depth + 1))
            if self.current().type == TokenType.COMMA:
                self.advance()
                if self.current().type == TokenType.RBRACE:
                    raise XCONParseError(
                        "Trailing comma not allowed",
                        self.current().line,
                        self.current().column,
                    )
            elif self.current().type != TokenType.RBRACE:
                tok = self.current()
                seen = (
                    "end of input"
                    if tok.type == TokenType.EOF
                    else f"{tok.type.value}"
                    + (f" ('{tok.value}')" if tok.value else "")
                )
                raise XCONParseError(
                    f"Expected ',' or '}}' but got {seen}",
                    tok.line,
                    tok.column,
                )
        self.expect(TokenType.RBRACE, "}")
        return DocumentNode(fields=fields)

    def parse_field_value(self, depth: int) -> FieldValueNode:
        if self.current().type == TokenType.LBRACE:
            return self.parse_document(depth)
        if self.current().type == TokenType.LBRACKET:
            return self.parse_array(depth)
        if self.current().type in (TokenType.COMMA, TokenType.RBRACE):
            return ValueNode(raw="", quoted=False)
        if self.current().type in (TokenType.LABEL_OR_VALUE, TokenType.QUOTED_STRING):
            tok = self.advance()
            return ValueNode(raw=tok.value, quoted=tok.quoted)
        tok = self.current()
        seen = (
            "end of input"
            if tok.type == TokenType.EOF
            else f"{tok.type.value}"
            + (f" ('{tok.value}')" if tok.value else "")
        )
        raise XCONParseError(
            f"Unexpected token: {seen}",
            tok.line,
            tok.column,
        )

    def parse_array(self, depth: int) -> ArrayNode:
        if depth >= self.max_depth:
            tok = self.current()
            raise XCONParseError(
                f"Array nesting depth exceeds maxDepth ({self.max_depth})",
                tok.line,
                tok.column,
            )
        self.expect(TokenType.LBRACKET, "[")
        items: List[FieldValueNode] = []
        while self.current().type != TokenType.RBRACKET:
            if self.current().type == TokenType.EOF:
                raise XCONParseError(
                    "Unexpected end of input — expected ']' to close array",
                    self.current().line,
                    self.current().column,
                )
            items.append(self.parse_field_value(depth + 1))
            if self.current().type == TokenType.COMMA:
                self.advance()
                if self.current().type == TokenType.RBRACKET:
                    raise XCONParseError(
                        "Trailing comma not allowed",
                        self.current().line,
                        self.current().column,
                    )
            elif self.current().type != TokenType.RBRACKET:
                tok = self.current()
                seen = (
                    "end of input"
                    if tok.type == TokenType.EOF
                    else f"{tok.type.value}"
                    + (f" ('{tok.value}')" if tok.value else "")
                )
                raise XCONParseError(
                    f"Expected ',' or ']' but got {seen}",
                    tok.line,
                    tok.column,
                )
        self.expect(TokenType.RBRACKET, "]")
        return ArrayNode(items=items)


def parse_to_ast(input_text: str, options: Optional[ParseOptions] = None) -> XCONDocument:
    """Parse XCON text to AST."""
    opts = options or ParseOptions()
    if len(input_text) > opts.max_length:
        raise XCONParseError(
            f"Input exceeds maxLength limit ({opts.max_length} bytes)",
            1,
            1,
        )
    tokens = tokenize(input_text)
    parser = Parser(tokens, opts.max_depth, opts.max_rows)
    return parser.parse()


def parse(
    input_text: str, options: Optional[ParseOptions] = None
) -> Union[Dict[str, Any], List[Any]]:
    """Parse XCON text to a Python object."""
    ast = parse_to_ast(input_text, options)
    return evaluate(ast)


def evaluate(doc: XCONDocument) -> Union[Dict[str, Any], List[Any]]:
    """Evaluate AST to a Python object."""
    if not doc.body.rows:
        return {} if doc.header else []

    has_labels = any(row.label is not None for row in doc.body.rows)
    all_have_labels = all(row.label is not None for row in doc.body.rows)

    if has_labels and not all_have_labels:
        offending = next(
            (r for r in doc.body.rows if r.label is None), doc.body.rows[0]
        )
        raise XCONParseError(
            "Mixed labeled and unlabeled rows",
            offending.label_line,
            offending.label_column,
        )

    schema = doc.header.labels if doc.header else []

    if has_labels:
        result: Dict[str, Any] = {}
        for row in doc.body.rows:
            value = evaluate_document(
                row.document, schema, row.label_line, row.label_column
            )
            assert row.label is not None
            result[row.label] = value
        return result

    array_result: List[Any] = []
    for row in doc.body.rows:
        array_result.append(
            evaluate_document(row.document, schema, row.label_line, row.label_column)
        )
    return array_result


def evaluate_document(
    doc: DocumentNode,
    schema: List[LabelNode],
    line: int,
    column: int,
) -> Union[Dict[str, Any], List[Any]]:
    """Evaluate a document node."""
    if not doc.fields:
        return []

    if not schema:
        return [evaluate_field_value(f, [], line, column) for f in doc.fields]

    result: Dict[str, Any] = {}
    for i, label in enumerate(schema):
        if i >= len(doc.fields):
            result[label.name] = [] if label.is_array else None
            continue
        field = doc.fields[i]
        evaluated = evaluate_field_value(field, label.children, line, column)

        if label.is_array:
            if isinstance(evaluated, list):
                if label.children:
                    assert isinstance(field, ArrayNode)
                    result[label.name] = [
                        evaluate_field_value(item, label.children, line, column)
                        for item in field.items
                    ]
                else:
                    result[label.name] = evaluated
            elif (
                isinstance(field, ValueNode)
                and field.raw == ""
                and not field.quoted
            ):
                result[label.name] = []
            else:
                raise XCONParseError(
                    f"Field '{label.name}' is declared as an array but received a non-array value",
                    line,
                    column,
                )
        elif label.children:
            if not isinstance(field, DocumentNode) and not (
                isinstance(field, ValueNode) and field.raw == "" and not field.quoted
            ):
                raise XCONParseError(
                    f"Field '{label.name}' is declared as a nested document but received a scalar",
                    line,
                    column,
                )
            result[label.name] = evaluated
        else:
            result[label.name] = evaluated
    return result


def evaluate_field_value(
    field: FieldValueNode,
    schema: List[LabelNode],
    line: int,
    column: int,
) -> Any:
    """Evaluate a field value."""
    if isinstance(field, ValueNode):
        if field.quoted:
            return field.raw
        if field.raw == "":
            return ""
        return infer_type(field.raw)
    if isinstance(field, ArrayNode):
        return [evaluate_field_value(item, schema, line, column) for item in field.items]
    if isinstance(field, DocumentNode):
        return evaluate_document(field, schema, line, column)
    return None
