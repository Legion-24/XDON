"""Tests for tokenizer."""

from lmon.tokenizer import tokenize, TokenType


def test_simple_header() -> None:
    tokens = tokenize('(name,age)')
    assert any(t.type == TokenType.LPAREN for t in tokens)
    assert any(t.type == TokenType.LABEL_OR_VALUE and t.value == 'name' for t in tokens)
    assert any(t.type == TokenType.COMMA for t in tokens)


def test_array_marker() -> None:
    tokens = tokenize('(name,tags[])')
    assert any(t.type == TokenType.ARRAY_MARKER for t in tokens)


def test_simple_document() -> None:
    tokens = tokenize('{Alice,30}')
    assert any(t.type == TokenType.LBRACE for t in tokens)
    assert any(t.type == TokenType.LABEL_OR_VALUE and t.value == 'Alice' for t in tokens)
    assert any(t.type == TokenType.RBRACE for t in tokens)


def test_quoted_values() -> None:
    tokens = tokenize('"hello world"')
    assert any(t.type == TokenType.QUOTED_STRING and t.value == 'hello world' for t in tokens)


def test_escaped_chars() -> None:
    tokens = tokenize('{"a\\,b"}')
    assert any(t.type == TokenType.QUOTED_STRING and t.value == 'a,b' for t in tokens)


def test_array() -> None:
    tokens = tokenize('[admin,user]')
    assert any(t.type == TokenType.LBRACKET for t in tokens)
    assert any(t.type == TokenType.RBRACKET for t in tokens)


def test_row_with_label() -> None:
    tokens = tokenize('user1:{Alice,30}')
    assert any(t.type == TokenType.LABEL_OR_VALUE and t.value == 'user1' for t in tokens)
    assert any(t.type == TokenType.COLON for t in tokens)


def test_newline_tracking() -> None:
    tokens = tokenize('{hello}\nworld')
    assert any(t.type == TokenType.NEWLINE for t in tokens)


def test_eof() -> None:
    tokens = tokenize('{hello}')
    assert tokens[-1].type == TokenType.EOF
