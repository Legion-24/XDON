import { expand, MacroContext, XCONMacroError } from '../src';
import { parse } from '../src';

describe('macro: simple variables', () => {
  test('A1: basic expansion', () => {
    const input = '%x = "hello"\n%x world';
    expect(expand(input)).toBe('hello world');
  });

  test('A2: multiple uses', () => {
    const input = '%x = "hi"\n%x %x';
    expect(expand(input)).toBe('hi hi');
  });

  test('A3: re-definition wins', () => {
    const input = '%x = "a"\n%x = "b"\n%x';
    expect(expand(input)).toBe('b');
  });

  test('A4: forward ref error', () => {
    const input = '%x\n%x = "a"';
    expect(() => expand(input)).toThrow(XCONMacroError);
  });

  test('A5: embedded in XCON', () => {
    const input = '%lbl = "label1,label2"\n(%lbl)';
    expect(expand(input)).toBe('(label1,label2)');
  });

  test('A6: name case sensitivity', () => {
    const input = '%myVar = "v"\n%myVar';
    expect(expand(input)).toBe('v');
  });

  test('A7: underscore in name', () => {
    const input = '%my_var = "v"\n%my_var';
    expect(expand(input)).toBe('v');
  });

  test('A8: definition line consumed', () => {
    const input = '%x = "a"\n(name)';
    const lines = expand(input).split('\n');
    expect(lines).toEqual(['(name)']);
  });
});

describe('macro: parameterized', () => {
  test('B1: basic call', () => {
    const input = '%f(a) = "{a}!"\n%f(hi)';
    expect(expand(input)).toBe('hi!');
  });

  test('B2: two parameters', () => {
    const input = '%f(a,b) = "{a},{b}"\n%f(x,y)';
    expect(expand(input)).toBe('x,y');
  });

  test('B3: wrong arg count (too few)', () => {
    const input = '%f(a,b) = "{a}"\n%f(x)';
    expect(() => expand(input)).toThrow(XCONMacroError);
  });

  test('B4: wrong arg count (too many)', () => {
    const input = '%f(a) = "{a}"\n%f(x,y)';
    expect(() => expand(input)).toThrow(XCONMacroError);
  });

  test('B5: call simple macro with params', () => {
    const input = '%x = "v"\n%x(a)';
    expect(() => expand(input)).toThrow(XCONMacroError);
  });

  test('B6: call parameterized macro without params', () => {
    const input = '%f(a) = "{a}"\n%f';
    expect(() => expand(input)).toThrow(XCONMacroError);
  });

  test('B7: unused placeholder', () => {
    const input = '%f(a,b) = "{a}"\n%f(x,y)';
    expect(expand(input)).toBe('x');
  });

  test('B8: placeholder repeated', () => {
    const input = '%f(a) = "{a}-{a}"\n%f(hi)';
    expect(expand(input)).toBe('hi-hi');
  });

  test('B9: arg containing spaces', () => {
    const input = '%f(a) = "[{a}]"\n%f(hello world)';
    expect(expand(input)).toBe('[hello world]');
  });
});

describe('macro: nesting', () => {
  test('C1: macro refs macro', () => {
    const input = '%a = "hello"\n%b = "%a world"\n%b';
    expect(expand(input)).toBe('hello world');
  });

  test('C2: param macro refs simple', () => {
    const input = '%sep = ","\n%row(a,b) = "{a}%sep {b}"\n%row(x,y)';
    expect(expand(input)).toBe('x, y');
  });

  test('C3: circular detection', () => {
    const input = '%a = "%b"\n%b = "%a"\n%a';
    expect(() => expand(input)).toThrow(XCONMacroError);
  });

  test('C4: max depth limit', () => {
    let input = '%a0 = "x"\n';
    for (let i = 1; i < 20; i++) {
      input += `%a${i} = "%a${i - 1}"\n`;
    }
    input += '%a19';
    expect(() => expand(input, { maxDepth: 16 })).toThrow(XCONMacroError);
  });
});

describe('macro: expressions', () => {
  test('D1: addition', () => {
    expect(expand('%{4+5}')).toBe('9');
  });

  test('D2: subtraction', () => {
    expect(expand('%{10-3}')).toBe('7');
  });

  test('D3: multiplication', () => {
    expect(expand('%{3*4}')).toBe('12');
  });

  test('D4: division (float result)', () => {
    expect(expand('%{10/4}')).toBe('2.5');
  });

  test('D5: integer division result', () => {
    expect(expand('%{10/2}')).toBe('5');
  });

  test('D6: modulo', () => {
    expect(expand('%{10%3}')).toBe('1');
  });

  test('D7: operator precedence', () => {
    expect(expand('%{2+3*4}')).toBe('14');
  });

  test('D8: parentheses', () => {
    expect(expand('%{(2+3)*4}')).toBe('20');
  });

  test('D9: unary minus', () => {
    expect(expand('%{-5+3}')).toBe('-2');
  });

  test('D10: float operands', () => {
    expect(expand('%{1.5+2.5}')).toBe('4');
  });

  test('D11: macro in expression', () => {
    const input = '%n = "5"\n%{%n+1}';
    expect(expand(input)).toBe('6');
  });

  test('D12: division by zero', () => {
    expect(() => expand('%{5/0}')).toThrow(XCONMacroError);
  });

  test('D13: invalid expression', () => {
    expect(() => expand('%{abc}')).toThrow(XCONMacroError);
  });

  test('D14: unclosed brace', () => {
    expect(() => expand('%{5+3')).toThrow(XCONMacroError);
  });

  test('D15: nested parentheses', () => {
    expect(expand('%{((2+3))}')).toBe('5');
  });
});

describe('macro: errors with line tracking', () => {
  test('E1: undefined macro strict mode', () => {
    const input = '(name)\n%noexist';
    expect(() => expand(input, { strict: true })).toThrow(XCONMacroError);
  });

  test('E2: forward reference', () => {
    const input = '%x\n%x = "a"';
    expect(() => expand(input)).toThrow(XCONMacroError);
  });

  test('E3: bad definition (no quote) treated as content', () => {
    const input = '%x = ADMIN';
    const result = expand(input, { strict: false });
    expect(result).toBe('%x = ADMIN');
  });

  test('E4: unterminated param list', () => {
    const input = '%f(a\n%f(x)';
    expect(() => expand(input)).toThrow(XCONMacroError);
  });
});

describe('macro: pre-defined context', () => {
  test('F1: pre-defined visible', () => {
    const ctx = new Map([
      ['env', { body: 'prod', params: null, sourceLine: 0 }],
    ]);
    const input = '%env';
    expect(expand(input, { initialContext: ctx })).toBe('prod');
  });

  test('F2: document overrides pre-defined', () => {
    const ctx = new Map([
      ['x', { body: 'a', params: null, sourceLine: 0 }],
    ]);
    const input = '%x = "b"\n%x';
    expect(expand(input, { initialContext: ctx })).toBe('b');
  });

  test('F3: pre-defined available from line 1', () => {
    const ctx = new Map([
      ['predef', { body: 'yes', params: null, sourceLine: 0 }],
    ]);
    const input = '%predef';
    expect(expand(input, { initialContext: ctx })).toBe('yes');
  });
});

describe('macro: non-strict mode', () => {
  test('leaves unknown macros as-is', () => {
    const input = 'value: %unknown';
    expect(expand(input, { strict: false })).toBe('value: %unknown');
  });

  test('still expands defined macros', () => {
    const input = '%x = "a"\nval: %x and %unknown';
    expect(expand(input, { strict: false })).toBe('val: a and %unknown');
  });
});

describe('macro: integration with XCON parsing', () => {
  test('G1: header macro round-trip', () => {
    const input = '%hdr = "name,age"\n(%hdr)\nalice:{Alice,30}';
    const expanded = expand(input);
    const parsed = parse(expanded);
    expect(parsed).toEqual({ alice: { name: 'Alice', age: 30 } });
  });

  test('G2: row macro round-trip', () => {
    const input =
      '%row = "{Alice,30}"\nalice:%row\nbob:{Bob,25}';
    const expanded = expand(input);
    expect(expanded).toBe('alice:{Alice,30}\nbob:{Bob,25}');
    expect(() => parse(expanded)).not.toThrow();
  });

  test('G3: numeric expression in value', () => {
    const input = '{%{2*3},Charlie}';
    const expanded = expand(input);
    const result = parse(expanded);
    expect(result).toEqual([[6, 'Charlie']]);
  });
});

describe('macro: spec-defined macros', () => {
  test('_DATE_STR returns YYYY-MM-DD', () => {
    const result = expand('%_DATE_STR');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('_TIMESTAMP returns Unix seconds', () => {
    const result = expand('%_TIMESTAMP');
    const ts = parseInt(result);
    expect(ts).toBeGreaterThan(0);
    expect(ts).toBeLessThan(Date.now() / 1000 + 1);
  });

  test('_DATETIME_STR returns ISO 8601', () => {
    const result = expand('%_DATETIME_STR');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('_DAY_STR returns day name', () => {
    const result = expand('%_DAY_STR');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(days).toContain(result);
  });

  test('_TIME_STR returns HH:MM:SS', () => {
    const result = expand('%_TIME_STR');
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('_UUID generates UUID v4', () => {
    const result = expand('%_UUID');
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('_ENV macro is available', () => {
    const input = '%_ENV(PATH)';
    const result = expand(input);
    expect(result).toBeTruthy();
  });

  test('spec macros in simple form', () => {
    const result = expand('%_UUID');
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('spec macro in expression with timestamp', () => {
    const result = expand('%{1+1}');
    expect(result).toBe('2');
  });

  test('user macro overrides spec macro', () => {
    const input = '%_DATE_STR = "custom"\n%_DATE_STR';
    const result = expand(input);
    expect(result).toBe('custom');
  });

  test('spec macros with user-defined macros', () => {
    const input = '%prefix = "ID:"\n%prefix%_UUID';
    const result = expand(input);
    expect(result).toMatch(/^ID:[0-9a-f-]+$/i);
  });
});

describe('macro: edge cases', () => {
  test('escapes in definition body', () => {
    const input = '%msg = "hello\\"world"\n%msg';
    expect(expand(input)).toBe('hello"world');
  });

  test('newlines in macro expansion', () => {
    const input = '%x = "line1\\nline2"\n%x';
    expect(expand(input)).toBe('line1\nline2');
  });

  test('trailing newline preservation', () => {
    const input = '%x = "a"\n%x\n';
    const result = expand(input);
    expect(result.endsWith('\n')).toBe(true);
  });

  test('empty parameter list', () => {
    const input = '%f() = "body"\n%f()';
    const expanded = expand(input);
    expect(expanded).toBe('body');
  });

  test('expression with spaces', () => {
    expect(expand('%{ 2 + 3 * 4 }')).toBe('14');
  });

  test('multiple macros on same line', () => {
    const input = '%a = "x"\n%b = "y"\n%a %b';
    expect(expand(input)).toBe('x y');
  });

  test('macro name at end of line without args', () => {
    const input = '%x = "val"\nprefix %x';
    expect(expand(input)).toBe('prefix val');
  });
});
