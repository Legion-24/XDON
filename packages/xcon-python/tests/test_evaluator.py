"""Tests for type inference."""

from xcon.evaluator import infer_type


def test_null() -> None:
    assert infer_type('null') is None


def test_true() -> None:
    assert infer_type('true') is True


def test_false() -> None:
    assert infer_type('false') is False


def test_integer() -> None:
    assert infer_type('42') == 42


def test_negative_integer() -> None:
    assert infer_type('-42') == -42


def test_float() -> None:
    assert infer_type('3.14') == 3.14


def test_string() -> None:
    assert infer_type('hello') == 'hello'


def test_empty_string() -> None:
    assert infer_type('') == ''


def test_zero() -> None:
    assert infer_type('0') == 0


def test_negative_zero() -> None:
    assert infer_type('-0') == 0
