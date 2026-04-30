"""Tests for parser."""

import pytest
from xcon.parser import parse_to_ast, parse
from xcon.errors import XCONParseError


def test_simple_document() -> None:
    ast = parse_to_ast('(name,age)\nalice:{Alice,30}')
    assert ast.header is not None
    assert len(ast.header.labels) == 2
    assert len(ast.body.rows) == 1


def test_multiple_rows() -> None:
    ast = parse_to_ast('(name)\nalice:{Alice}\nbob:{Bob}')
    assert len(ast.body.rows) == 2


def test_headerless() -> None:
    ast = parse_to_ast('{Alice,30}')
    assert ast.header is None


def test_row_labels() -> None:
    ast = parse_to_ast('(name)\nalice:{Alice}')
    assert ast.body.rows[0].label == 'alice'


def test_nested_schema() -> None:
    ast = parse_to_ast('(name,address:(city,zip))\nalice:{Alice,{NYC,10001}}')
    address_label = next((l for l in ast.header.labels if l.name == 'address'), None)
    assert address_label is not None
    assert len(address_label.children) == 2


def test_unclosed_brace() -> None:
    with pytest.raises(XCONParseError):
        parse_to_ast('{hello')


def test_parse_returns_dict() -> None:
    result = parse('(name)\nuser:{Alice}')
    assert isinstance(result, dict)
    assert 'user' in result


def test_parse_returns_array() -> None:
    result = parse('{Alice}')
    assert isinstance(result, list)
