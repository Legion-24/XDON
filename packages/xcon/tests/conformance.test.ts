/**
 * v1.0 conformance tests — exercises every bug fixed for v1.0 readiness.
 * These tests must pass identically in the Python implementation
 * (see packages/xcon-python/tests/test_conformance.py).
 */
import {
  parse,
  stringify,
  toJSON,
  fromJSON,
  expand,
  inferType,
  XCONParseError,
  XCONStringifyError,
  XCONMacroError,
  VERSION,
} from '../src/index';

describe('v1.0: version', () => {
  test('VERSION constant', () => {
    expect(VERSION).toBe('1.0.0-beta.1');
  });
});

describe('v1.0: reserved leading characters', () => {
  test('@ is rejected at start of bare value', () => {
    expect(() => parse('{@user}')).toThrow(XCONParseError);
  });
  test('# is rejected at start of bare value', () => {
    expect(() => parse('{#tag}')).toThrow(XCONParseError);
  });
  test('% is rejected at start of bare value', () => {
    expect(() => parse('{%macro}')).toThrow(XCONParseError);
  });
  test('@ is allowed mid-value', () => {
    expect(parse('{user@example.com}')).toEqual([['user@example.com']]);
  });
  test('@ is allowed when quoted', () => {
    expect(parse('{"@user"}')).toEqual([['@user']]);
  });
  test('@ is allowed when escaped', () => {
    expect(parse('{\\@user}')).toEqual([['@user']]);
  });
});

describe('v1.0: type inference (quoted vs bare)', () => {
  test('bare null -> null', () => {
    expect(parse('{null}')).toEqual([[null]]);
  });
  test('quoted "null" -> string', () => {
    expect(parse('{"null"}')).toEqual([['null']]);
  });
  test('bare 42 -> integer', () => {
    expect(parse('{42}')).toEqual([[42]]);
  });
  test('quoted "42" -> string', () => {
    expect(parse('{"42"}')).toEqual([['42']]);
  });
  test('bare true/false -> boolean', () => {
    expect(parse('{true,false}')).toEqual([[true, false]]);
  });
  test('quoted "true" -> string', () => {
    expect(parse('{"true"}')).toEqual([['true']]);
  });
  test('-0 normalizes to 0', () => {
    expect(inferType('-0')).toBe(0);
  });
  test('1e5 is string (no scientific notation in v1)', () => {
    expect(parse('{1e5}')).toEqual([['1e5']]);
  });
  test('1.x is string', () => {
    expect(parse('{1.x}')).toEqual([['1.x']]);
  });
  test('--5 is a string (not a crash)', () => {
    expect(parse('{--5}')).toEqual([['--5']]);
  });
});

describe('v1.0: empty document semantics', () => {
  test('{} produces []', () => {
    expect(parse('{}')).toEqual([[]]);
  });
  test('empty input produces []', () => {
    expect(parse('')).toEqual([]);
  });
  test('header only with no rows produces {}', () => {
    expect(parse('(a,b)')).toEqual({});
  });
});

describe('v1.0: mixed labeled/unlabeled rows', () => {
  test('error has line/column info, not 0:0', () => {
    try {
      parse('a:{1}\n{2}');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(XCONParseError);
      const e = err as XCONParseError;
      expect(e.line).toBeGreaterThan(0);
      expect(e.column).toBeGreaterThan(0);
    }
  });
});

describe('v1.0: trailing commas error', () => {
  test('trailing comma in document', () => {
    expect(() => parse('{a,b,}')).toThrow(XCONParseError);
  });
  test('trailing comma in array', () => {
    expect(() => parse('{[a,b,]}')).toThrow(XCONParseError);
  });
  test('trailing comma in header', () => {
    expect(() => parse('(a,b,)\n{1,2,3}')).toThrow(XCONParseError);
  });
});

describe('v1.0: schema enforcement', () => {
  test('non-array in array slot errors', () => {
    expect(() => parse('(tags[])\n{single}')).toThrow(XCONParseError);
  });
  test('scalar in nested-document slot errors', () => {
    expect(() => parse('(addr:(city,zip))\n{notanobj}')).toThrow(XCONParseError);
  });
  test('empty value in array slot becomes []', () => {
    expect(parse('(tags[])\n{}')).toEqual([[]]);
  });
});

describe('v1.0: nested objects and arrays', () => {
  test('nested schema preserves keys', () => {
    expect(parse('(name,addr:(city,zip))\n{Alice,{NYC,10001}}')).toEqual([
      { name: 'Alice', addr: { city: 'NYC', zip: 10001 } },
    ]);
  });
  test('array of nested objects preserves keys', () => {
    const xcon = '(name,addrs[]:(city,zip))\nu:{Alice,[{NYC,10001},{LA,90001}]}';
    expect(parse(xcon)).toEqual({
      u: { name: 'Alice', addrs: [{ city: 'NYC', zip: 10001 }, { city: 'LA', zip: 90001 }] },
    });
  });
});

describe('v1.0: quoted labels', () => {
  test('quoted header labels accepted', () => {
    expect(parse('("first name",age)\n{Alice,30}')).toEqual([{ 'first name': 'Alice', age: 30 }]);
  });
  test('quoted row label accepted', () => {
    expect(parse('"row 1":{1,2}')).toEqual({ 'row 1': [1, 2] });
  });
});

describe('v1.0: parse limits', () => {
  test('maxDepth respected', () => {
    let s = '';
    for (let k = 0; k < 100; k++) s += '{';
    s += '1';
    for (let k = 0; k < 100; k++) s += '}';
    expect(() => parse(s, { maxDepth: 10 })).toThrow(XCONParseError);
  });
  test('maxLength respected', () => {
    expect(() => parse('{1}', { maxLength: 1 })).toThrow(XCONParseError);
  });
  test('maxRows respected', () => {
    expect(() => parse('{1}\n{2}\n{3}', { maxRows: 2 })).toThrow(XCONParseError);
  });
  test('default limits accept reasonable input', () => {
    expect(parse('{1}\n{2}')).toEqual([[1], [2]]);
  });
});

describe('v1.0: version directive', () => {
  test('!XCON 1.0 accepted', () => {
    expect(parse('!XCON 1.0\n{1}')).toEqual([[1]]);
  });
  test('!XCON 1.5 accepted (any 1.x)', () => {
    expect(parse('!XCON 1.5\n{1}')).toEqual([[1]]);
  });
  test('!XCON 2.0 rejected', () => {
    expect(() => parse('!XCON 2.0\n{1}')).toThrow(XCONParseError);
  });
  test('unknown !-directive rejected', () => {
    expect(() => parse('!UNKNOWN something\n{1}')).toThrow(XCONParseError);
  });
});

describe('v1.0: stringifier round-trip', () => {
  test('heterogeneous array of objects unions schemas', () => {
    const data = [
      { a: 1, b: 2 },
      { a: 3, c: 4 },
    ];
    const xcon = stringify(data);
    const back = parse(xcon);
    expect(back).toEqual([
      { a: 1, b: 2, c: null },
      { a: 3, b: null, c: 4 },
    ]);
  });
  test('array of nested objects round-trips losslessly', () => {
    const data = { u: { addrs: [{ city: 'NYC' }, { city: 'LA' }] } };
    const xcon = stringify(data);
    expect(parse(xcon)).toEqual(data);
  });
  test('cyclic input throws XCONStringifyError', () => {
    const o: any = { a: 1 };
    o.self = o;
    expect(() => stringify({ row: o })).toThrow(XCONStringifyError);
  });
  test('numeric-looking strings get quoted', () => {
    const out = stringify(['42', 'true', 'null']);
    expect(out).toContain('"42"');
    expect(out).toContain('"true"');
    expect(out).toContain('"null"');
  });
  test('reserved-leading strings get quoted', () => {
    expect(stringify(['@user'])).toContain('"@user"');
  });
});

describe('v1.0: JSON bridge', () => {
  test('toJSON / fromJSON round-trip on supported types', () => {
    const value = { u: { name: 'Alice', tags: ['admin'], age: 30, active: true } };
    const xcon = fromJSON(JSON.stringify(value));
    const back = JSON.parse(toJSON(xcon));
    expect(back).toEqual(value);
  });
});

describe('v1.0: macros', () => {
  test('per-reference _UUID generates unique values', () => {
    const out = expand('a:%_UUID b:%_UUID');
    const m = out.match(/[0-9a-f-]{36}/gi)!;
    expect(m).toHaveLength(2);
    expect(m[0]).not.toBe(m[1]);
  });
  test('_ENV requires allowlist', () => {
    expect(expand('%_ENV(PATH)')).toBe('');
  });
  test('placeholder substitution honors longest-name-first', () => {
    const out = expand('%m(a,ab) = "{a}-{ab}"\n%m(X,Y)');
    expect(out.trim()).toBe('X-Y');
  });
  test('nested-paren args parse correctly', () => {
    const out = expand('%greet(name) = "hello {name}"\n%greet(Mr (Smith))');
    expect(out.trim()).toBe('hello Mr (Smith)');
  });
  test('_UUID overridable', () => {
    const out = expand('%_UUID = "fixed"\n%_UUID');
    expect(out.trim()).toBe('fixed');
  });
});

describe('v1.0: error reporting', () => {
  test('parse errors include line and column', () => {
    try {
      parse('(a,b)\n{1,@2}');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(XCONParseError);
      const e = err as XCONParseError;
      expect(e.line).toBe(2);
      expect(e.column).toBeGreaterThan(0);
    }
  });
  test('macro errors include line and column', () => {
    try {
      expand('a\n%nope');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(XCONMacroError);
      const e = err as XCONMacroError;
      expect(e.line).toBe(2);
    }
  });
});
