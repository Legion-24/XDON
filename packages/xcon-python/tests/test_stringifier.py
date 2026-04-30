"""Tests for stringifier."""

from xcon.stringifier import stringify


def test_simple_object() -> None:
    obj = {'user1': {'name': 'Alice', 'age': 30}}
    result = stringify(obj)
    assert '(name,age)' in result
    assert 'user1:' in result
    assert 'Alice' in result


def test_array_in_data() -> None:
    obj = {'user1': {'name': 'Alice', 'tags': ['admin', 'user']}}
    result = stringify(obj)
    assert 'tags[]' in result


def test_nested() -> None:
    obj = {'user1': {'name': 'Alice', 'address': {'city': 'NYC'}}}
    result = stringify(obj)
    assert 'address:(city)' in result


def test_null() -> None:
    obj = {'row1': {'name': 'Alice', 'age': None}}
    result = stringify(obj)
    assert 'null' in result


def test_numbers() -> None:
    obj = {'row1': {'int': 42, 'float': 3.14}}
    result = stringify(obj)
    assert '42' in result
    assert '3.14' in result


def test_booleans() -> None:
    obj = {'row1': {'active': True, 'deleted': False}}
    result = stringify(obj)
    assert 'true' in result
    assert 'false' in result
