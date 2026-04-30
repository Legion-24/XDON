from enum import Enum
from dataclasses import dataclass
from typing import List, Optional


class TokenType(Enum):
    """Token types for LMON lexical analysis."""
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
    NEWLINE = "NEWLINE"
    EOF = "EOF"


@dataclass
class Token:
    """A lexical token."""
    type: TokenType
    value: str
    line: int
    column: int


def tokenize(input_text: str) -> List[Token]:
    """Tokenize LMON text into a list of tokens."""
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
            if input_text[i] == '\n':
                line += 1
                column = 1
            else:
                column += 1
            i += 1

    def skip_whitespace() -> None:
        while current() and current() in ' \t\r':
            advance()

    def read_quoted_string(quote: str) -> str:
        nonlocal i, line, column
        advance()  # skip opening quote
        value = ''
        while current() and current() != quote:
            if current() == '\\':
                advance()
                escaped = current()
                if escaped == 'n':
                    value += '\n'
                elif escaped == 't':
                    value += '\t'
                elif escaped == '\\':
                    value += '\\'
                elif escaped == quote:
                    value += quote
                else:
                    value += escaped or ''
                advance()
            else:
                value += current() or ''
                advance()
        if current() == quote:
            advance()
        return value

    def read_bare_word() -> str:
        nonlocal i
        value = ''
        while current() and current() in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_':
            value += current()
            advance()
        return value

    def read_unquoted_value() -> str:
        nonlocal i
        value = ''
        while (current() and
               current() not in ',{}[]\n' and
               current().strip()):  # not just whitespace
            if current() == '\\':
                advance()
                escaped = current()
                if escaped == 'n':
                    value += '\n'
                elif escaped == 't':
                    value += '\t'
                elif escaped == '\\':
                    value += '\\'
                elif escaped in ',:{}[]()':
                    value += escaped or ''
                else:
                    value += escaped or ''
                advance()
            else:
                value += current() or ''
                advance()
        return value.rstrip()

    while i < len(input_text):
        skip_whitespace()

        if i >= len(input_text):
            break

        ch = current()
        start_line = line
        start_column = column

        if ch == '(':
            tokens.append(Token(TokenType.LPAREN, '(', start_line, start_column))
            advance()
        elif ch == ')':
            tokens.append(Token(TokenType.RPAREN, ')', start_line, start_column))
            advance()
        elif ch == '{':
            tokens.append(Token(TokenType.LBRACE, '{', start_line, start_column))
            advance()
        elif ch == '}':
            tokens.append(Token(TokenType.RBRACE, '}', start_line, start_column))
            advance()
        elif ch == '[':
            tokens.append(Token(TokenType.LBRACKET, '[', start_line, start_column))
            advance()
        elif ch == ']':
            tokens.append(Token(TokenType.RBRACKET, ']', start_line, start_column))
            advance()
        elif ch == ':':
            tokens.append(Token(TokenType.COLON, ':', start_line, start_column))
            advance()
        elif ch == ',':
            tokens.append(Token(TokenType.COMMA, ',', start_line, start_column))
            advance()
        elif ch == '\n':
            tokens.append(Token(TokenType.NEWLINE, '\n', start_line, start_column))
            advance()
        elif ch in '"\'':
            value = read_quoted_string(ch)
            tokens.append(Token(TokenType.QUOTED_STRING, value, start_line, start_column))
        elif ch in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_':
            value = read_bare_word()

            # Check for array marker
            if current() == '[' and peek() == ']':
                tokens.append(Token(TokenType.LABEL_OR_VALUE, value, start_line, start_column))
                advance()
                advance()
                tokens.append(Token(TokenType.ARRAY_MARKER, '[]', line, column - 2))
            else:
                tokens.append(Token(TokenType.LABEL_OR_VALUE, value, start_line, start_column))
        else:
            value = read_unquoted_value()
            if value:
                tokens.append(Token(TokenType.LABEL_OR_VALUE, value, start_line, start_column))

    tokens.append(Token(TokenType.EOF, '', line, column))
    return tokens
