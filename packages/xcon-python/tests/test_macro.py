import pytest
from xcon import expand, MacroContext, MacroDefinition, ExpandOptions, XCONMacroError, parse


class TestSimpleVariableMacros:
    def test_a1_basic_expansion(self):
        input_text = '%x = "hello"\n%x world'
        assert expand(input_text) == 'hello world'

    def test_a2_multiple_uses(self):
        input_text = '%x = "hi"\n%x %x'
        assert expand(input_text) == 'hi hi'

    def test_a3_re_definition_wins(self):
        input_text = '%x = "a"\n%x = "b"\n%x'
        assert expand(input_text) == 'b'

    def test_a4_forward_ref_error(self):
        input_text = '%x\n%x = "a"'
        with pytest.raises(XCONMacroError):
            expand(input_text)

    def test_a5_embedded_in_xcon(self):
        input_text = '%lbl = "label1,label2"\n(%lbl)'
        assert expand(input_text) == '(label1,label2)'

    def test_a6_name_case_sensitivity(self):
        input_text = '%myVar = "v"\n%myVar'
        assert expand(input_text) == 'v'

    def test_a7_underscore_in_name(self):
        input_text = '%my_var = "v"\n%my_var'
        assert expand(input_text) == 'v'

    def test_a8_definition_line_consumed(self):
        input_text = '%x = "a"\n(name)'
        lines = expand(input_text).split('\n')
        assert lines == ['(name)']


class TestParameterizedMacros:
    def test_b1_basic_call(self):
        input_text = '%f(a) = "{a}!"\n%f(hi)'
        assert expand(input_text) == 'hi!'

    def test_b2_two_parameters(self):
        input_text = '%f(a,b) = "{a},{b}"\n%f(x,y)'
        assert expand(input_text) == 'x,y'

    def test_b3_wrong_arg_count_too_few(self):
        input_text = '%f(a,b) = "{a}"\n%f(x)'
        with pytest.raises(XCONMacroError):
            expand(input_text)

    def test_b4_wrong_arg_count_too_many(self):
        input_text = '%f(a) = "{a}"\n%f(x,y)'
        with pytest.raises(XCONMacroError):
            expand(input_text)

    def test_b5_call_simple_with_params(self):
        input_text = '%x = "v"\n%x(a)'
        with pytest.raises(XCONMacroError):
            expand(input_text)

    def test_b6_call_parameterized_without_params(self):
        input_text = '%f(a) = "{a}"\n%f'
        with pytest.raises(XCONMacroError):
            expand(input_text)

    def test_b7_unused_placeholder(self):
        input_text = '%f(a,b) = "{a}"\n%f(x,y)'
        assert expand(input_text) == 'x'

    def test_b8_placeholder_repeated(self):
        input_text = '%f(a) = "{a}-{a}"\n%f(hi)'
        assert expand(input_text) == 'hi-hi'

    def test_b9_arg_containing_spaces(self):
        input_text = '%f(a) = "[{a}]"\n%f(hello world)'
        assert expand(input_text) == '[hello world]'


class TestNestingExpansion:
    def test_c1_macro_refs_macro(self):
        input_text = '%a = "hello"\n%b = "%a world"\n%b'
        assert expand(input_text) == 'hello world'

    def test_c2_param_macro_refs_simple(self):
        input_text = '%sep = ","\n%row(a,b) = "{a}%sep {b}"\n%row(x,y)'
        assert expand(input_text) == 'x, y'

    def test_c3_circular_detection(self):
        input_text = '%a = "%b"\n%b = "%a"\n%a'
        with pytest.raises(XCONMacroError):
            expand(input_text)

    def test_c4_max_depth_limit(self):
        input_text = '%a0 = "x"\n'
        for i in range(1, 20):
            input_text += f'%a{i} = "%a{i-1}"\n'
        input_text += '%a19'
        with pytest.raises(XCONMacroError):
            expand(input_text, ExpandOptions(max_depth=16))


class TestExpressionMacros:
    def test_d1_addition(self):
        assert expand('%{4+5}') == '9'

    def test_d2_subtraction(self):
        assert expand('%{10-3}') == '7'

    def test_d3_multiplication(self):
        assert expand('%{3*4}') == '12'

    def test_d4_division_float_result(self):
        assert expand('%{10/4}') == '2.5'

    def test_d5_integer_division_result(self):
        assert expand('%{10/2}') == '5'

    def test_d6_modulo(self):
        assert expand('%{10%3}') == '1'

    def test_d7_operator_precedence(self):
        assert expand('%{2+3*4}') == '14'

    def test_d8_parentheses(self):
        assert expand('%{(2+3)*4}') == '20'

    def test_d9_unary_minus(self):
        assert expand('%{-5+3}') == '-2'

    def test_d10_float_operands(self):
        assert expand('%{1.5+2.5}') == '4'

    def test_d11_macro_in_expression(self):
        input_text = '%n = "5"\n%{%n+1}'
        assert expand(input_text) == '6'

    def test_d12_division_by_zero(self):
        with pytest.raises(XCONMacroError):
            expand('%{5/0}')

    def test_d13_invalid_expression(self):
        with pytest.raises(XCONMacroError):
            expand('%{abc}')

    def test_d14_unclosed_brace(self):
        with pytest.raises(XCONMacroError):
            expand('%{5+3')

    def test_d15_nested_parentheses(self):
        assert expand('%{((2+3))}') == '5'


class TestErrorsWithLineTracking:
    def test_e1_undefined_macro_strict_mode(self):
        input_text = '(name)\n%noexist'
        with pytest.raises(XCONMacroError):
            expand(input_text, ExpandOptions(strict=True))

    def test_e2_forward_reference(self):
        input_text = '%x\n%x = "a"'
        with pytest.raises(XCONMacroError):
            expand(input_text)

    def test_e3_bad_definition_no_quote_as_content(self):
        input_text = '%x = ADMIN'
        result = expand(input_text, ExpandOptions(strict=False))
        assert result == '%x = ADMIN'

    def test_e4_unterminated_param_list(self):
        input_text = '%f(a\n%f(x)'
        with pytest.raises(XCONMacroError):
            expand(input_text)


class TestPredefinedContext:
    def test_f1_predefined_visible(self):
        ctx: MacroContext = {
            'env': MacroDefinition(body='prod', params=None, source_line=0)
        }
        input_text = '%env'
        assert expand(input_text, ExpandOptions(initial_context=ctx)) == 'prod'

    def test_f2_document_overrides_predefined(self):
        ctx: MacroContext = {
            'x': MacroDefinition(body='a', params=None, source_line=0)
        }
        input_text = '%x = "b"\n%x'
        assert expand(input_text, ExpandOptions(initial_context=ctx)) == 'b'

    def test_f3_predefined_available_from_line_1(self):
        ctx: MacroContext = {
            'predef': MacroDefinition(body='yes', params=None, source_line=0)
        }
        input_text = '%predef'
        assert expand(input_text, ExpandOptions(initial_context=ctx)) == 'yes'


class TestNonStrictMode:
    def test_leaves_unknown_macros_as_is(self):
        input_text = 'value: %unknown'
        assert expand(input_text, ExpandOptions(strict=False)) == 'value: %unknown'

    def test_still_expands_defined_macros(self):
        input_text = '%x = "a"\nval: %x and %unknown'
        assert expand(input_text, ExpandOptions(strict=False)) == 'val: a and %unknown'


class TestIntegrationWithXCONParsing:
    def test_g1_header_macro_roundtrip(self):
        input_text = '%hdr = "name,age"\n(%hdr)\nalice:{Alice,30}'
        expanded = expand(input_text)
        parsed = parse(expanded)
        assert parsed == {'alice': {'name': 'Alice', 'age': 30}}

    def test_g2_row_macro_roundtrip(self):
        input_text = '%row = "{Alice,30}"\nalice:%row\nbob:{Bob,25}'
        expanded = expand(input_text)
        assert expanded == 'alice:{Alice,30}\nbob:{Bob,25}'
        assert parse(expanded) is not None

    def test_g3_numeric_expression_in_value(self):
        input_text = '{%{2*3},Charlie}'
        expanded = expand(input_text)
        result = parse(expanded)
        assert result == [[6, 'Charlie']]


class TestSpecDefinedMacros:
    def test_date_str_returns_iso_date(self):
        import re
        result = expand('%_DATE_STR')
        assert re.match(r'^\d{4}-\d{2}-\d{2}$', result)

    def test_timestamp_returns_unix_seconds(self):
        import time
        result = expand('%_TIMESTAMP')
        ts = int(result)
        assert ts > 0
        assert ts < time.time() + 1

    def test_datetime_str_returns_iso_8601(self):
        import re
        result = expand('%_DATETIME_STR')
        assert re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', result)

    def test_day_str_returns_day_name(self):
        result = expand('%_DAY_STR')
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        assert result in days

    def test_time_str_returns_hh_mm_ss(self):
        import re
        result = expand('%_TIME_STR')
        assert re.match(r'^\d{2}:\d{2}:\d{2}$', result)

    def test_uuid_generates_uuid_v4(self):
        import re
        result = expand('%_UUID')
        assert re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', result, re.I)

    def test_env_reads_environment_variable(self):
        import os
        os.environ['TEST_VAR_MACRO'] = 'test_value_123'
        result = expand('%_ENV(TEST_VAR_MACRO)')
        assert result == 'test_value_123'

    def test_env_returns_empty_for_undefined(self):
        result = expand('%_ENV(UNDEFINED_VAR_THAT_SHOULD_NOT_EXIST_XYZ)')
        assert result == ''

    def test_spec_macros_in_simple_form(self):
        import re
        result = expand('%_UUID')
        assert re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', result, re.I)

    def test_spec_macro_in_expression(self):
        result = expand('%{1+1}')
        assert result == '2'

    def test_user_macro_overrides_spec_macro(self):
        input_text = '%_DATE_STR = "custom"\n%_DATE_STR'
        result = expand(input_text)
        assert result == 'custom'

    def test_spec_macros_with_user_defined_macros(self):
        import re
        input_text = '%prefix = "ID:"\n%prefix%_UUID'
        result = expand(input_text)
        assert re.match(r'^ID:[0-9a-f-]+$', result, re.I)


class TestEdgeCases:
    def test_escapes_in_definition_body(self):
        input_text = '%msg = "hello\\"world"\n%msg'
        assert expand(input_text) == 'hello"world'

    def test_newlines_in_macro_expansion(self):
        input_text = '%x = "line1\\nline2"\n%x'
        assert expand(input_text) == 'line1\nline2'

    def test_trailing_newline_preservation(self):
        input_text = '%x = "a"\n%x\n'
        result = expand(input_text)
        assert result.endswith('\n')

    def test_empty_parameter_list(self):
        input_text = '%f() = "body"\n%f()'
        assert expand(input_text) == 'body'

    def test_expression_with_spaces(self):
        assert expand('%{ 2 + 3 * 4 }') == '14'

    def test_multiple_macros_on_same_line(self):
        input_text = '%a = "x"\n%b = "y"\n%a %b'
        assert expand(input_text) == 'x y'

    def test_macro_name_at_end_of_line_without_args(self):
        input_text = '%x = "val"\nprefix %x'
        assert expand(input_text) == 'prefix val'
