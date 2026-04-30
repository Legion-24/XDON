"""v1.0 conformance tests — exercises every bug fixed for v1.0 readiness.

These tests mirror packages/xcon/tests/conformance.test.ts and must pass
identically in both implementations.
"""
import pytest

from xcon import (
    VERSION,
    ExpandOptions,
    ParseOptions,
    XCONMacroError,
    XCONParseError,
    XCONStringifyError,
    expand,
    from_json,
    parse,
    stringify,
    to_json,
)
from xcon.evaluator import infer_type


# v1.0: version
def test_version_constant():
    assert VERSION == "1.0.0"


# v1.0: reserved leading characters
class TestReservedLeading:
    def test_at_rejected(self):
        with pytest.raises(XCONParseError):
            parse("{@user}")

    def test_hash_rejected(self):
        with pytest.raises(XCONParseError):
            parse("{#tag}")

    def test_percent_rejected(self):
        with pytest.raises(XCONParseError):
            parse("{%macro}")

    def test_at_mid_value_allowed(self):
        assert parse("{user@example.com}") == [["user@example.com"]]

    def test_at_quoted_allowed(self):
        assert parse('{"@user"}') == [["@user"]]

    def test_at_escaped_allowed(self):
        assert parse("{\\@user}") == [["@user"]]


# v1.0: type inference (quoted vs bare)
class TestTypeInference:
    def test_bare_null(self):
        assert parse("{null}") == [[None]]

    def test_quoted_null_string(self):
        assert parse('{"null"}') == [["null"]]

    def test_bare_42_int(self):
        assert parse("{42}") == [[42]]

    def test_quoted_42_string(self):
        assert parse('{"42"}') == [["42"]]

    def test_bare_booleans(self):
        assert parse("{true,false}") == [[True, False]]

    def test_quoted_true_string(self):
        assert parse('{"true"}') == [["true"]]

    def test_negative_zero_normalizes(self):
        assert infer_type("-0") == 0

    def test_scientific_notation_string(self):
        assert parse("{1e5}") == [["1e5"]]

    def test_no_leading_dot_float(self):
        # 1.x is a string (not a valid float)
        assert parse("{1.x}") == [["1.x"]]

    def test_double_negative_string(self):
        # --5 must NOT crash; it's just a string
        assert parse("{--5}") == [["--5"]]


# v1.0: empty document semantics
class TestEmptyDoc:
    def test_brace_pair_yields_empty_array(self):
        assert parse("{}") == [[]]

    def test_empty_input_yields_empty_array(self):
        assert parse("") == []

    def test_header_only_yields_empty_object(self):
        assert parse("(a,b)") == {}


# v1.0: mixed labeled/unlabeled rows
class TestMixedRows:
    def test_error_has_location(self):
        try:
            parse("a:{1}\n{2}")
            pytest.fail("should have thrown")
        except XCONParseError as e:
            assert e.line > 0
            assert e.column > 0


# v1.0: trailing commas
class TestTrailingCommas:
    def test_trailing_in_doc(self):
        with pytest.raises(XCONParseError):
            parse("{a,b,}")

    def test_trailing_in_array(self):
        with pytest.raises(XCONParseError):
            parse("{[a,b,]}")

    def test_trailing_in_header(self):
        with pytest.raises(XCONParseError):
            parse("(a,b,)\n{1,2,3}")


# v1.0: schema enforcement
class TestSchemaEnforcement:
    def test_non_array_in_array_slot_errors(self):
        with pytest.raises(XCONParseError):
            parse("(tags[])\n{single}")

    def test_scalar_in_nested_slot_errors(self):
        with pytest.raises(XCONParseError):
            parse("(addr:(city,zip))\n{notanobj}")

    def test_empty_value_in_array_slot(self):
        assert parse("(tags[])\n{}") == [[]]


# v1.0: nested objects and arrays
class TestNesting:
    def test_nested_keys_preserved(self):
        assert parse("(name,addr:(city,zip))\n{Alice,{NYC,10001}}") == [
            {"name": "Alice", "addr": {"city": "NYC", "zip": 10001}}
        ]

    def test_array_of_nested_objects(self):
        x = "(name,addrs[]:(city,zip))\nu:{Alice,[{NYC,10001},{LA,90001}]}"
        assert parse(x) == {
            "u": {
                "name": "Alice",
                "addrs": [
                    {"city": "NYC", "zip": 10001},
                    {"city": "LA", "zip": 90001},
                ],
            }
        }


# v1.0: quoted labels
class TestQuotedLabels:
    def test_quoted_header_label(self):
        assert parse('("first name",age)\n{Alice,30}') == [
            {"first name": "Alice", "age": 30}
        ]

    def test_quoted_row_label(self):
        assert parse('"row 1":{1,2}') == {"row 1": [1, 2]}


# v1.0: parse limits
class TestParseLimits:
    def test_max_depth(self):
        s = "{" * 100 + "1" + "}" * 100
        with pytest.raises(XCONParseError):
            parse(s, ParseOptions(max_depth=10))

    def test_max_length(self):
        with pytest.raises(XCONParseError):
            parse("{1}", ParseOptions(max_length=1))

    def test_max_rows(self):
        with pytest.raises(XCONParseError):
            parse("{1}\n{2}\n{3}", ParseOptions(max_rows=2))

    def test_default_limits_accept_normal_input(self):
        assert parse("{1}\n{2}") == [[1], [2]]


# v1.0: version directive
class TestVersionDirective:
    def test_v10_accepted(self):
        assert parse("!XCON 1.0\n{1}") == [[1]]

    def test_v15_accepted(self):
        assert parse("!XCON 1.5\n{1}") == [[1]]

    def test_v20_rejected(self):
        with pytest.raises(XCONParseError):
            parse("!XCON 2.0\n{1}")

    def test_unknown_directive_rejected(self):
        with pytest.raises(XCONParseError):
            parse("!UNKNOWN something\n{1}")


# v1.0: stringifier round-trip
class TestStringifier:
    def test_heterogeneous_array_unions_schemas(self):
        data = [{"a": 1, "b": 2}, {"a": 3, "c": 4}]
        x = stringify(data)
        assert parse(x) == [
            {"a": 1, "b": 2, "c": None},
            {"a": 3, "b": None, "c": 4},
        ]

    def test_array_of_nested_objects_round_trip(self):
        data = {"u": {"addrs": [{"city": "NYC"}, {"city": "LA"}]}}
        x = stringify(data)
        assert parse(x) == data

    def test_cyclic_input_raises(self):
        o: dict = {"a": 1}
        o["self"] = o
        with pytest.raises(XCONStringifyError):
            stringify({"row": o})

    def test_numeric_strings_quoted(self):
        out = stringify(["42", "true", "null"])
        assert '"42"' in out
        assert '"true"' in out
        assert '"null"' in out

    def test_reserved_leading_strings_quoted(self):
        assert '"@user"' in stringify(["@user"])


# v1.0: JSON bridge
class TestJSONBridge:
    def test_round_trip(self):
        import json
        value = {"u": {"name": "Alice", "tags": ["admin"], "age": 30, "active": True}}
        x = from_json(json.dumps(value))
        assert json.loads(to_json(x)) == value


# v1.0: macros
class TestMacros:
    def test_per_ref_uuid(self):
        out = expand("a:%_UUID b:%_UUID")
        import re
        ms = re.findall(r"[0-9a-f-]{36}", out, re.I)
        assert len(ms) == 2
        assert ms[0] != ms[1]

    def test_env_requires_allowlist(self):
        assert expand("%_ENV(PATH)") == ""

    def test_placeholder_longest_name_first(self):
        out = expand('%m(a,ab) = "{a}-{ab}"\n%m(X,Y)')
        assert out.strip() == "X-Y"

    def test_nested_paren_args(self):
        out = expand('%greet(name) = "hello {name}"\n%greet(Mr (Smith))')
        assert out.strip() == "hello Mr (Smith)"

    def test_uuid_overridable(self):
        out = expand('%_UUID = "fixed"\n%_UUID')
        assert out.strip() == "fixed"


# v1.0: error reporting
class TestErrorReporting:
    def test_parse_error_has_location(self):
        try:
            parse("(a,b)\n{1,@2}")
            pytest.fail("should have thrown")
        except XCONParseError as e:
            assert e.line == 2
            assert e.column > 0

    def test_macro_error_has_location(self):
        try:
            expand("a\n%nope")
            pytest.fail("should have thrown")
        except XCONMacroError as e:
            assert e.line == 2
