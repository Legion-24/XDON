from typing import List, Dict, Union, Any, Optional
from .tokenizer import Token, TokenType, tokenize
from .ast_nodes import (
    LMONDocument,
    HeaderNode,
    BodyNode,
    RowNode,
    DocumentNode,
    FieldValueNode,
    LabelNode,
    ValueNode,
    ArrayNode,
)
from .errors import LMONParseError
from .evaluator import infer_type


class Parser:
    """Recursive descent parser for LMON."""

    def __init__(self, tokens: List[Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    def current(self) -> Token:
        return self.tokens[self.pos]

    def peek(self, offset: int = 1) -> Optional[Token]:
        pos = self.pos + offset
        return self.tokens[pos] if pos < len(self.tokens) else None

    def advance(self) -> Token:
        token = self.tokens[self.pos]
        self.pos += 1
        return token

    def expect(self, token_type: TokenType) -> Token:
        token = self.current()
        if token.type != token_type:
            raise LMONParseError(
                f"Expected {token_type.value} but got {token.type.value}",
                token.line,
                token.column,
            )
        return self.advance()

    def skip_newlines(self) -> None:
        while self.current().type == TokenType.NEWLINE:
            self.advance()

    def parse(self) -> LMONDocument:
        self.skip_newlines()

        header: Optional[HeaderNode] = None

        if self.current().type == TokenType.LPAREN:
            header = self.parse_header()
            self.skip_newlines()

        body = self.parse_body()

        return LMONDocument(header=header, body=body)

    def parse_header(self) -> HeaderNode:
        self.expect(TokenType.LPAREN)
        labels = self.parse_label_list()
        self.expect(TokenType.RPAREN)
        return HeaderNode(labels=labels)

    def parse_label_list(self) -> List[LabelNode]:
        labels: List[LabelNode] = []

        labels.append(self.parse_label())

        while self.current().type == TokenType.COMMA:
            self.advance()
            labels.append(self.parse_label())

        return labels

    def parse_label(self) -> LabelNode:
        token = self.expect(TokenType.LABEL_OR_VALUE)
        is_array = False
        children: List[LabelNode] = []

        if self.current().type == TokenType.ARRAY_MARKER:
            self.advance()
            is_array = True

        # Check for nested schema: label:(sublabel,...)
        if self.current().type == TokenType.COLON:
            self.advance()
            if self.current().type == TokenType.LPAREN:
                self.advance()
                children = self.parse_label_list()
                self.expect(TokenType.RPAREN)

        return LabelNode(name=token.value, is_array=is_array, children=children)

    def parse_body(self) -> BodyNode:
        rows: List[RowNode] = []

        while self.current().type != TokenType.EOF:
            self.skip_newlines()
            if self.current().type == TokenType.EOF:
                break

            rows.append(self.parse_row())
            self.skip_newlines()

        return BodyNode(rows=rows)

    def parse_row(self) -> RowNode:
        label: Optional[str] = None

        # Check for row label (LABEL_OR_VALUE followed by COLON)
        next_token = self.peek()
        if (self.current().type == TokenType.LABEL_OR_VALUE and
                next_token and next_token.type == TokenType.COLON):
            label = self.advance().value
            self.expect(TokenType.COLON)

        # Allow bare array as row body, not just a document
        if self.current().type == TokenType.LBRACKET:
            array = self.parse_array()
            document = DocumentNode(fields=[array])
        else:
            document = self.parse_document()

        return RowNode(label=label, document=document)

    def parse_document(self) -> DocumentNode:
        self.expect(TokenType.LBRACE)

        fields: List[FieldValueNode] = []

        while self.current().type != TokenType.RBRACE:
            fields.append(self.parse_field_value())

            if self.current().type == TokenType.COMMA:
                self.advance()
                # Trailing comma is an error
                if self.current().type == TokenType.RBRACE:
                    raise LMONParseError(
                        "Trailing comma not allowed",
                        self.current().line,
                        self.current().column,
                    )

        self.expect(TokenType.RBRACE)

        return DocumentNode(fields=fields)

    def parse_field_value(self) -> FieldValueNode:
        if self.current().type == TokenType.LBRACE:
            return self.parse_document()

        if self.current().type == TokenType.LBRACKET:
            return self.parse_array()

        # Empty value case
        if (self.current().type == TokenType.COMMA or
                self.current().type == TokenType.RBRACE):
            return ValueNode(raw='')

        # Must be a value
        if (self.current().type == TokenType.LABEL_OR_VALUE or
                self.current().type == TokenType.QUOTED_STRING):
            token = self.advance()
            return ValueNode(raw=token.value)

        raise LMONParseError(
            f"Unexpected token: {self.current().type.value}",
            self.current().line,
            self.current().column,
        )

    def parse_array(self) -> ArrayNode:
        self.expect(TokenType.LBRACKET)

        items: List[FieldValueNode] = []

        while self.current().type != TokenType.RBRACKET:
            items.append(self.parse_field_value())

            if self.current().type == TokenType.COMMA:
                self.advance()
                if self.current().type == TokenType.RBRACKET:
                    raise LMONParseError(
                        "Trailing comma not allowed",
                        self.current().line,
                        self.current().column,
                    )

        self.expect(TokenType.RBRACKET)

        return ArrayNode(items=items)


def parse_to_ast(input_text: str) -> LMONDocument:
    """Parse LMON text to AST."""
    tokens = tokenize(input_text)
    parser = Parser(tokens)
    return parser.parse()


def parse(input_text: str) -> Union[Dict[str, Any], list]:
    """Parse LMON text to Python object."""
    ast = parse_to_ast(input_text)
    return evaluate(ast)


def evaluate(doc: LMONDocument) -> Union[Dict[str, Any], list]:
    """Evaluate AST to Python object."""
    if not doc.body.rows:
        return {} if doc.header else []

    # Check if rows have labels
    has_labels = any(row.label for row in doc.body.rows)
    all_have_labels = all(row.label for row in doc.body.rows)

    if has_labels and not all_have_labels:
        raise LMONParseError("Mixed labeled and unlabeled rows", 0, 0)

    if has_labels:
        result: Dict[str, Any] = {}
        for row in doc.body.rows:
            value = evaluate_document(row.document, doc.header.labels if doc.header else [])
            result[row.label] = value
        return result

    # No labels - return array
    result_array: list = []
    for row in doc.body.rows:
        value = evaluate_document(row.document, doc.header.labels if doc.header else [])
        result_array.append(value)
    return result_array


def evaluate_document(
    doc: DocumentNode,
    schema: List[LabelNode],
) -> Union[Dict[str, Any], list]:
    """Evaluate a document node."""
    values: list = []

    for field in doc.fields:
        schema_for_field = schema[len(values)].children if len(values) < len(schema) else []
        values.append(evaluate_field_value(field, schema_for_field))

    if not schema:
        # No schema: return array
        return values

    # Apply schema to values positionally
    result: Dict[str, Any] = {}
    for i, label in enumerate(schema):
        value = values[i] if i < len(values) else None

        if label.is_array:
            # This field should be an array
            if isinstance(value, list):
                result[label.name] = value
            elif value is None:
                result[label.name] = []
            else:
                result[label.name] = [value]
        elif label.children:
            # This field is a nested document
            result[label.name] = value
        else:
            result[label.name] = value

    return result


def evaluate_field_value(
    field: FieldValueNode,
    schema: List[LabelNode],
) -> Any:
    """Evaluate a field value."""
    if isinstance(field, ValueNode):
        return infer_type(field.raw)

    if isinstance(field, ArrayNode):
        return [evaluate_field_value(item, []) for item in field.items]

    if isinstance(field, DocumentNode):
        return evaluate_document(field, schema)

    return None
