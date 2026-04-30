/**
 * Branch-coverage tests — exercises defensive error paths and edge cases
 * that the conformance/unit tests don't naturally hit.
 */
import {
  parse,
  parseToAST,
  stringify,
  toJSON,
  fromJSON,
  expand,
  inferType,
  tokenize,
  TokenType,
  XCONParseError,
  XCONStringifyError,
  XCONMacroError,
} from '../src/index';

describe('coverage: evaluator', () => {
  test('integer beyond Number.MAX_SAFE_INTEGER preserved as string', () => {
    expect(inferType('99999999999999999999')).toBe('99999999999999999999');
  });
  test('arbitrary string passthrough', () => {
    expect(inferType('hello')).toBe('hello');
  });
  test('float inference', () => {
    expect(inferType('3.14')).toBe(3.14);
  });
});

describe('coverage: tokenizer', () => {
  test('strips UTF-8 BOM', () => {
    const out = parse('﻿{1}');
    expect(out).toEqual([[1]]);
  });

  test('quoted string escapes (\\n, \\t, \\\\, \\")', () => {
    const out = parse('{"line1\\nline2\\ttabbed\\\\back\\"quote"}');
    expect(out).toEqual([['line1\nline2\ttabbed\\back"quote']]);
  });

  test('unterminated quoted string', () => {
    expect(() => parse('{"unclosed')).toThrow(XCONParseError);
  });

  test('newline inside quoted string is rejected', () => {
    expect(() => parse('{"line\nbreak"}')).toThrow(XCONParseError);
  });

  test('unterminated escape in quoted string', () => {
    expect(() => parse('{"trail\\')).toThrow(XCONParseError);
  });

  test('unterminated escape in bare value', () => {
    expect(() => parse('{abc\\')).toThrow(XCONParseError);
  });

  test('reserved char % errors mid-value too if leading', () => {
    expect(() => parse('{ %abc}')).toThrow(XCONParseError);
  });

  test('unexpected character errors', () => {
    expect(() => parse('{?}')).toThrow(XCONParseError);
  });

  test('tokenize emits NEWLINE and EOF', () => {
    const t = tokenize('{1}\n{2}');
    expect(t.some((x) => x.type === TokenType.NEWLINE)).toBe(true);
    expect(t[t.length - 1]!.type).toBe(TokenType.EOF);
  });

  test('quoted single-quote escape', () => {
    const out = parse("{'it\\'s'}");
    expect(out).toEqual([["it's"]]);
  });
});

describe('coverage: parser', () => {
  test('expect with unexpected EOF', () => {
    expect(() => parse('(a,b')).toThrow(XCONParseError);
  });

  test('document EOF before closing brace', () => {
    expect(() => parse('{1,2')).toThrow(XCONParseError);
  });

  test('array EOF before closing bracket', () => {
    expect(() => parse('{[1,2}')).toThrow(XCONParseError);
  });

  test('expected , or } error', () => {
    expect(() => parse('{1 2}')).toThrow(XCONParseError);
  });

  test('expected , or ] error', () => {
    expect(() => parse('{[1 2]}')).toThrow(XCONParseError);
  });

  test('unexpected EOF in field value position', () => {
    expect(() => parseToAST('{')).toThrow(XCONParseError);
  });

  test('missing row body after label', () => {
    expect(() => parse('label:')).toThrow(XCONParseError);
  });

  test('label expected but got non-label-token', () => {
    expect(() => parse('(,b)\n{1,2}')).toThrow(XCONParseError);
  });

  test('row label as quoted string + colon', () => {
    expect(parse('"x":{1}')).toEqual({ x: [1] });
  });

  test('schema with fewer fields than row keeps extras out', () => {
    expect(parse('(a)\n{1,2,3}')).toEqual([{ a: 1 }]);
  });

  test('schema with more fields than row fills missing with null/[]', () => {
    expect(parse('(a,b,tags[])\n{1}')).toEqual([{ a: 1, b: null, tags: [] }]);
  });

  test('depth limit triggers at array depth too', () => {
    let s = '{';
    for (let k = 0; k < 50; k++) s += '[';
    s += '1';
    for (let k = 0; k < 50; k++) s += ']';
    s += '}';
    expect(() => parse(s, { maxDepth: 5 })).toThrow(XCONParseError);
  });

  test('directive must be valid format', () => {
    expect(() => parse('!XCON\n{1}')).toThrow(XCONParseError);
  });

  test('row body bare array with no header', () => {
    expect(parse('lab:[1,2,3]')).toEqual({ lab: [[1, 2, 3]] });
  });

  test('mixed labeled/unlabeled all-labels-on-second-row', () => {
    expect(() => parse('{1}\nlab:{2}')).toThrow(XCONParseError);
  });

  test('null schema field for absent value (object form)', () => {
    expect(parse('(a,b)\n{1}')).toEqual([{ a: 1, b: null }]);
  });

  test('unexpected token inside document', () => {
    expect(() => parse('{)}')).toThrow(XCONParseError);
  });

  test('unexpected EOF inside array', () => {
    expect(() => parse('{[')).toThrow(XCONParseError);
  });

  test('empty unquoted value in array slot becomes []', () => {
    expect(parse('(tags[],b)\n{,5}')).toEqual([{ tags: [], b: 5 }]);
  });

  test('expression unexpected token after parsing', () => {
    // 1+2 5 — extra number after parse — the lex doesn't allow space-then-number
    // but parens after a number could surface this. Use `1 5`.
    expect(() => expand('%{1 5}')).toThrow(XCONMacroError);
  });
});

describe('coverage: stringifier', () => {
  test('scalar input wraps in single-row doc', () => {
    expect(stringify(42)).toBe('{42}');
    expect(stringify('hello')).toBe('{hello}');
    expect(stringify(null)).toBe('{null}');
    expect(stringify(true)).toBe('{true}');
  });

  test('empty array yields empty string', () => {
    expect(stringify([])).toBe('');
  });

  test('empty object yields empty string', () => {
    expect(stringify({})).toBe('');
  });

  test('array of empty objects', () => {
    expect(stringify([{}, {}])).toBe('{}\n{}');
  });

  test('object whose values are all empty objects', () => {
    expect(stringify({ a: {}, b: {} })).toBe('a:{}\nb:{}');
  });

  test('mixed-type object emits schemaless rows', () => {
    const out = stringify({ a: 1, b: [2, 3], c: 'x' });
    expect(out).toContain('a:{1}');
    expect(out).toContain('b:{2,3}');
    expect(out).toContain('c:{x}');
  });

  test('rowLabels: false treats object as single row', () => {
    const out = stringify({ a: 1, b: 2 }, { rowLabels: false });
    expect(out).toBe('(a,b)\n{1,2}');
  });

  test('array of arrays (no header)', () => {
    expect(stringify([[1, 2], [3, 4]])).toBe('{1,2}\n{3,4}');
  });

  test('array of mixed (object + scalar) emits schemaless', () => {
    const out = stringify([{ a: 1 }, 'scalar']);
    expect(out).toContain('{1}');
    expect(out).toContain('{scalar}');
  });

  test('schema-merged array slot rejects scalar in earlier row', () => {
    // Second row has array (forces isArray); first row has nested object
    const data = [{ x: { a: 1 } }, { x: [1, 2] }];
    expect(() => stringify(data)).toThrow(XCONStringifyError);
  });

  test('array slot value is non-array throws via direct schema mismatch', () => {
    // Build an internal mismatch: first object marks `tags` as array, second has scalar.
    const data = [{ tags: [1, 2] }, { tags: 'oops' }];
    expect(() => stringify(data)).toThrow(XCONStringifyError);
  });

  test('array of nested objects: item is not an object throws', () => {
    const data = [{ addrs: [{ city: 'A' }] }, { addrs: [{ city: 'B' }, 'broken'] }];
    expect(() => stringify(data)).toThrow(XCONStringifyError);
  });

  test('nested object slot value is not an object throws', () => {
    const data = [{ addr: { city: 'A' } }, { addr: 'oops' }];
    expect(() => stringify(data)).toThrow(XCONStringifyError);
  });

  test('Infinity / NaN are quoted', () => {
    const out = stringify([Number.POSITIVE_INFINITY, Number.NaN]);
    expect(out).toContain('"Infinity"');
    expect(out).toContain('"NaN"');
  });

  test('bigint serializes', () => {
    const out = stringify([[10n, 20n]]);
    expect(out).toBe('{10,20}');
  });

  test('arrays of arrays inside scalar position', () => {
    const out = stringify({ a: { b: [[1, 2], [3, 4]] } }, { rowLabels: false });
    expect(out).toContain('[[1,2],[3,4]]');
  });

  test('unsupported value type throws', () => {
    const sym = Symbol('x');
    expect(() => stringify([sym as unknown])).toThrow(XCONStringifyError);
  });

  test('empty string formats as ""', () => {
    expect(stringify([''])).toContain('""');
  });

  test('reserved-leading row-label keys quoted', () => {
    expect(stringify({ '@k': { a: 1 } })).toContain('"@k"');
  });

  test('empty-string row-label key quoted', () => {
    expect(stringify({ '': { a: 1 } })).toContain('""');
  });

  test('schemaless cycle detection in formatRowSchemaless', () => {
    const a: any = { x: 1 };
    a.self = a;
    expect(() => stringify({ row: [a, 'plain'] })).toThrow(XCONStringifyError);
  });

  test('schemaless cycle detection in formatScalar nested object', () => {
    const a: any = { x: 1 };
    a.self = a;
    // Wrap in array+object to hit formatScalar's object branch
    expect(() => stringify({ k: 'string', mixed: a })).toThrow(XCONStringifyError);
  });

  test('header-only with empty objects under rowLabels=false', () => {
    expect(stringify({}, { rowLabels: false })).toBe('');
  });

  test('schema mergeFields: array marker on second row', () => {
    const out = stringify([{ tags: [{ city: 'NY' }] }, { tags: [{ city: 'LA', zip: 1 }] }]);
    expect(out).toContain('tags[]:(city,zip)');
  });
});

describe('coverage: macros', () => {
  test('expression with unbalanced parens', () => {
    expect(() => expand('%{(1+2}')).toThrow(XCONMacroError);
  });

  test('expression with unexpected character', () => {
    expect(() => expand('%{1+a}')).toThrow(XCONMacroError);
  });

  test('expression invalid leading op', () => {
    expect(() => expand('%{*5}')).toThrow(XCONMacroError);
  });

  test('expression: trailing operator (number expected)', () => {
    expect(() => expand('%{1+}')).toThrow(XCONMacroError);
  });

  test('division by zero', () => {
    expect(() => expand('%{1/0}')).toThrow(XCONMacroError);
  });

  test('modulo by zero', () => {
    expect(() => expand('%{1%0}')).toThrow(XCONMacroError);
  });

  test('decoded escape (\\\\) in body', () => {
    const out = expand('%x = "back\\\\slash"\n%x');
    expect(out.trim()).toBe('back\\slash');
  });

  test('decoded escape (\\t) in body', () => {
    const out = expand('%x = "a\\tb"\n%x');
    expect(out.trim()).toBe('a\tb');
  });

  test('decoded escape (other) in body passes through', () => {
    const out = expand('%x = "\\z"\n%x');
    expect(out.trim()).toBe('z');
  });

  test('nested escape in argument splitting', () => {
    const out = expand('%f(a) = "got {a}"\n%f(comma\\,here)');
    expect(out.trim()).toBe('got comma\\,here');
  });

  test('escaped paren inside arg is preserved by findMatchingParen', () => {
    // \( is escaped — should not affect paren depth
    const out = expand('%f(a) = "x{a}y"\n%f(it\\(s)');
    expect(out.trim()).toBe('xit\\(sy');
  });

  test('macro with no params called with no args', () => {
    const out = expand('%x = "hi"\n%x');
    expect(out.trim()).toBe('hi');
  });

  test('non-strict mode leaves unknown macro as-is', () => {
    const out = expand('%unknown', { strict: false });
    expect(out).toBe('%unknown');
  });

  test('non-strict unknown macro with args reproduces call', () => {
    const out = expand('%unknown(a,b)', { strict: false });
    expect(out).toBe('%unknown(a,b)');
  });

  test('macro takes no params but called with args', () => {
    expect(() => expand('%x = "v"\n%x(arg)')).toThrow(XCONMacroError);
  });

  test('macro arg count mismatch', () => {
    expect(() => expand('%f(a,b) = "x"\n%f(1)')).toThrow(XCONMacroError);
  });

  test('unclosed parameter list', () => {
    expect(() => expand('%f(a) = "x"\n%f(arg')).toThrow(XCONMacroError);
  });

  test('% followed by non-identifier passes through', () => {
    const out = expand('100% off');
    expect(out).toBe('100% off');
  });

  test('initialContext supplies macros', () => {
    const ctx = new Map([
      ['greet', { body: 'hello', params: null, sourceLine: 0 }],
    ]);
    const out = expand('%greet', { initialContext: ctx });
    expect(out).toBe('hello');
  });

  test('envAllowlist = "*" allows all env vars', () => {
    // PATH almost certainly exists in test env
    const path = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.PATH ?? '';
    const out = expand('%_ENV(PATH)', { envAllowlist: '*' });
    expect(out).toBe(path);
  });

  test('_ENV with empty arg returns empty', () => {
    const out = expand('%_ENV()', { envAllowlist: '*' });
    expect(out).toBe('');
  });

  test('_DATE_STR returns ISO date', () => {
    const out = expand('%_DATE_STR');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('_TIME_STR returns HH:MM:SS', () => {
    const out = expand('%_TIME_STR');
    expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('_DATETIME_STR returns ISO datetime', () => {
    const out = expand('%_DATETIME_STR');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('_TIMESTAMP returns unix seconds', () => {
    const out = expand('%_TIMESTAMP');
    expect(out).toMatch(/^\d+$/);
  });

  test('_DAY_STR returns weekday name', () => {
    const out = expand('%_DAY_STR');
    expect(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).toContain(
      out.trim(),
    );
  });

  test('expansion depth exceeded errors', () => {
    expect(() => expand('%a = "%a"\n%a', { maxDepth: 3 })).toThrow(XCONMacroError);
  });

  test('paren-bare expression with macro reference', () => {
    const out = expand('%n = "5"\n%{(%n+3)*2}');
    expect(out.trim()).toBe('16');
  });

  test('expression with integer-valued float result renders as int', () => {
    const out = expand('%{2.0+1}');
    expect(out.trim()).toBe('3');
  });

  test('expression with non-integer result renders as float', () => {
    const out = expand('%{1/4}');
    expect(out.trim()).toBe('0.25');
  });
});

describe('coverage: json bridge', () => {
  test('toJSON parses and stringifies', () => {
    expect(toJSON('(a)\n{1}')).toBe(JSON.stringify([{ a: 1 }]));
  });
  test('fromJSON parses JSON and stringifies XCON', () => {
    expect(fromJSON('[{"a":1}]')).toBe('(a)\n{1}');
  });
});
