from enum import Enum
from dataclasses import dataclass
from typing import List, Optional

from .errors import XCONParseError


class TokenType(Enum):
    """Token types for XCON lexical analysis."""
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    LBRACE = "LBRACE"
    RBRACE = "RBRACE"
    LBRACKET = "LBRACKET"
    RBRACKET = "RBRACKET"
    COLON = "COLON"
    COMMA = "COMMA"
    LABEL_OR_VALUE = "LABEL_OR_VALUE"
    QUOTED_STRING = "QUOTED_STRING"
    ARRAY_MARKER = "ARRAY_MARKER"
    DIRECTIVE = "DIRECTIVE"
    NEWLINE = "NEWLINE"
    EOF = "EOF"


@dataclass
class Token:
    """A lexical token."""
    type: TokenType
    value: str
    line: int
    column: int
    quoted: bool = False


_RESERVED_LEADING = frozenset({"@", "#", "!", "%"})
_DELIMITERS = frozenset({",", "{", "}", "[", "]", "(", ")", ":", "\n"})
_BARE_WORD_START = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
_BARE_WORD_CHARS = _BARE_WORD_START + "0123456789"


def tokenize(input_text: str) -> List[Token]:
    """Tokenize XCON text into a list of tokens.

    - Skips a leading UTF-8 BOM if present.
    - Reserved leading characters (@, #, !, %) raise XCONParseError in bare position.
    - Lines beginning with '!' at line start are emitted as DIRECTIVE tokens.
    """
    if input_text.startswith("﻿"):
        input_text = input_text[1:]

    tokens: List[Token] = []
    i = 0
    line = 1
    column = 1

    def current() -> Optional[str]:
        return input_text[i] if i < len(input_text) else None

    def peek(offset: int = 1) -> Optional[str]:
        pos = i + offset
        return input_text[pos] if pos < len(input_text) else None

    def advance() -> None:
        nonlocal i, line, column
        if i < len(input_text):
            if input_text[i] == "\n":
                line += 1
                column = 1
            else:
                column += 1
            i += 1

    def skip_inline_whitespace() -> None:
        while current() in (" ", "\t", "\r"):
            advance()

    def read_quoted_string(quote: str, start_line: int, start_column: int) -> str:
        advance()  # consume opening quote
        value = ""
        while current() is not None and current() != quote:
            ch = current()
            if ch == "\n":
                raise XCONParseError(
                    "Unterminated quoted string (newline before closing quote)",
                    start_line,
                    start_column,
                )
            if ch == "\\":
                advance()
                escaped = current()
                if escaped is None:
                    raise XCONParseError(
                        "Unterminated escape sequence in quoted string",
                        line,
                        column,
                    )
                if escaped == "n":
                    value += "\n"
                elif escaped == "t":
                    value += "\t"
                elif escaped == "\\":
                    value += "\\"
                elif escaped in ('"', "'"):
                    value += escaped
                else:
                    value += escaped
                advance()
            else:
                value += ch or ""
                advance()
        if current() != quote:
            raise XCONParseError(
                f"Unterminated quoted string (expected closing {quote})",
                start_line,
                start_column,
            )
        advance()  # consume closing quote
        return value

    def read_bare_value(start_line: int, start_column: int) -> str:
        value = ""
        while current() is not None:
            ch = current()
            if ch in _DELIMITERS or ch in (" ", "\t", "\r"):
                break
            if ch == "\\":
                advance()
                escaped = current()
                if escaped is None:
                    raise XCONParseError(
                        "Unterminated escape sequence in bare value",
                        line,
                        column,
                    )
                if escaped == "n":
                    value += "\n"
                elif escaped == "t":
                    value += "\t"
                elif escaped == "\\":
                    value += "\\"
                else:
                    value += escaped
                advance()
                continue
            if not value and ch in _RESERVED_LEADING:
                raise XCONParseError(
                    f"Reserved character '{ch}' at start of bare value (quote or escape it)",
                    start_line,
                    start_column,
                )
            value += ch or ""
            advance()
        return value

    def read_directive() -> None:
        start_line = line
        start_column = column
        directive = ""
        while current() is not None and current() != "\n":
            directive += current() or ""
            advance()
        tokens.append(
            Token(TokenType.DIRECTIVE, directive, start_line, start_column, quoted=False)
        )

    at_line_start = True

    while i < len(input_text):
        skip_inline_whitespace()

        if i >= len(input_text):
            break

        ch = current()
        start_line = line
        start_column = column

        if at_line_start and ch == "!":
            read_directive()
            continue

        at_line_start = False

        if ch == "(":
            tokens.append(Token(TokenType.LPAREN, "(", start_line, start_column))
            advance()
        elif ch == ")":
            tokens.append(Token(TokenType.RPAREN, ")", start_line, start_column))
            advance()
        elif ch == "{":
            tokens.append(Token(TokenType.LBRACE, "{", start_line, start_column))
            advance()
        elif ch == "}":
            tokens.append(Token(TokenType.RBRACE, "}", start_line, start_column))
            advance()
        elif ch == "[":
            tokens.append(Token(TokenType.LBRACKET, "[", start_line, start_column))
            advance()
        elif ch == "]":
            tokens.append(Token(TokenType.RBRACKET, "]", start_line, start_column))
            advance()
        elif ch == ":":
            tokens.append(Token(TokenType.COLON, ":", start_line, start_column))
            advance()
        elif ch == ",":
            tokens.append(Token(TokenType.COMMA, ",", start_line, start_column))
            advance()
        elif ch == "\n":
            tokens.append(Token(TokenType.NEWLINE, "\n", start_line, start_column))
            advance()
            at_line_start = True
        elif ch in ('"', "'"):
            value = read_quoted_string(ch, start_line, start_column)
            tokens.append(
                Token(TokenType.QUOTED_STRING, value, start_line, start_column, quoted=True)
            )
        elif ch is not None and (ch in _BARE_WORD_CHARS or ch == "-" or ch == "\\"):
            value = read_bare_value(start_line, start_column)
            if current() == "[" and peek() == "]":
                tokens.append(
                    Token(TokenType.LABEL_OR_VALUE, value, start_line, start_column)
                )
                marker_line = line
                marker_column = column
                advance()
                advance()
                tokens.append(
                    Token(TokenType.ARRAY_MARKER, "[]", marker_line, marker_column)
                )
            else:
                tokens.append(
                    Token(TokenType.LABEL_OR_VALUE, value, start_line, start_column)
                )
        elif ch is not None:
            if ch in _RESERVED_LEADING:
                raise XCONParseError(
                    f"Reserved character '{ch}' at start of bare value (quote or escape it)",
                    start_line,
                    start_column,
                )
            raise XCONParseError(
                f"Unexpected character: '{ch}'",
                start_line,
                start_column,
            )

    tokens.append(Token(TokenType.EOF, "", line, column))
    return tokens
