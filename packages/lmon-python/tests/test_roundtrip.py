"""Round-trip integration tests."""

from lmon.parser import parse
from lmon.stringifier import stringify
from tests.conftest import FIXTURES


def test_roundtrip_parse() -> None:
    """Test that all fixtures parse to expected JSON."""
    for fixture_name, fixture_data in FIXTURES.items():
        lmon = fixture_data['lmon']
        expected_json = fixture_data['json']

        parsed = parse(lmon)
        assert parsed == expected_json, f"Fixture {fixture_name} parse failed"


def test_roundtrip_stringify() -> None:
    """Test that stringify and re-parse produces same result."""
    for fixture_name, fixture_data in FIXTURES.items():
        lmon = fixture_data['lmon']

        parsed = parse(lmon)
        stringified = stringify(parsed)
        reparsed = parse(stringified)

        assert reparsed == parsed, f"Fixture {fixture_name} stringify roundtrip failed"
