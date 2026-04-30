/**
 * v1.0 conformance tests — exercises every bug fixed for v1.0 readiness.
 * These tests must pass identically in the Python implementation
 * (see packages/xdon-python/tests/test_conformance.py).
 */
import {
  parse,
  stringify,
  toJSON,
  fromJSON,
  expand,
  inferType,
  XDONParseError,
  XDONStringifyError,
  XDONMacroError,
  VERSION,
} from '../src/index';

describe('v1.0: version', () => {
  test('VERSION constant', () => {
    expect(VERSION).toBe('1.0.0-beta.3');
  });
});

describe('v1.0: reserved leading characters', () => {
  test('@ is rejected at start of bare value', () => {
    expect(() => parse('{@user}')).toThrow(XDONParseError);
  });
  test('# is rejected at start of bare value', () => {
    expect(() => parse('{#tag}')).toThrow(XDONParseError);
  });
  test('% is rejected at start of bare value', () => {
    expect(() => parse('{%macro}')).toThrow(XDONParseError);
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
      expect(err).toBeInstanceOf(XDONParseError);
      const e = err as XDONParseError;
      expect(e.line).toBeGreaterThan(0);
      expect(e.column).toBeGreaterThan(0);
    }
  });
});

describe('v1.0: trailing commas error', () => {
  test('trailing comma in document', () => {
    expect(() => parse('{a,b,}')).toThrow(XDONParseError);
  });
  test('trailing comma in array', () => {
    expect(() => parse('{[a,b,]}')).toThrow(XDONParseError);
  });
  test('trailing comma in header', () => {
    expect(() => parse('(a,b,)\n{1,2,3}')).toThrow(XDONParseError);
  });
});

describe('v1.0: schema enforcement', () => {
  test('non-array in array slot errors', () => {
    expect(() => parse('(tags[])\n{single}')).toThrow(XDONParseError);
  });
  test('scalar in nested-document slot errors', () => {
    expect(() => parse('(addr:(city,zip))\n{notanobj}')).toThrow(XDONParseError);
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
    const xdon = '(name,addrs[]:(city,zip))\nu:{Alice,[{NYC,10001},{LA,90001}]}';
    expect(parse(xdon)).toEqual({
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
    expect(() => parse(s, { maxDepth: 10 })).toThrow(XDONParseError);
  });
  test('maxLength respected', () => {
    expect(() => parse('{1}', { maxLength: 1 })).toThrow(XDONParseError);
  });
  test('maxRows respected', () => {
    expect(() => parse('{1}\n{2}\n{3}', { maxRows: 2 })).toThrow(XDONParseError);
  });
  test('default limits accept reasonable input', () => {
    expect(parse('{1}\n{2}')).toEqual([[1], [2]]);
  });
});

describe('v1.0: version directive', () => {
  test('!XDON 1.0 accepted', () => {
    expect(parse('!XDON 1.0\n{1}')).toEqual([[1]]);
  });
  test('!XDON 1.5 accepted (any 1.x)', () => {
    expect(parse('!XDON 1.5\n{1}')).toEqual([[1]]);
  });
  test('!XDON 2.0 rejected', () => {
    expect(() => parse('!XDON 2.0\n{1}')).toThrow(XDONParseError);
  });
  test('unknown !-directive rejected', () => {
    expect(() => parse('!UNKNOWN something\n{1}')).toThrow(XDONParseError);
  });
});

describe('v1.0: stringifier round-trip', () => {
  test('heterogeneous array of objects unions schemas', () => {
    const data = [
      { a: 1, b: 2 },
      { a: 3, c: 4 },
    ];
    const xdon = stringify(data);
    const back = parse(xdon);
    expect(back).toEqual([
      { a: 1, b: 2, c: null },
      { a: 3, b: null, c: 4 },
    ]);
  });
  test('array of nested objects round-trips losslessly', () => {
    const data = { u: { addrs: [{ city: 'NYC' }, { city: 'LA' }] } };
    const xdon = stringify(data);
    expect(parse(xdon)).toEqual(data);
  });
  test('cyclic input throws XDONStringifyError', () => {
    const o: any = { a: 1 };
    o.self = o;
    expect(() => stringify({ row: o })).toThrow(XDONStringifyError);
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
    const xdon = fromJSON(JSON.stringify(value));
    const back = JSON.parse(toJSON(xdon));
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
      expect(err).toBeInstanceOf(XDONParseError);
      const e = err as XDONParseError;
      expect(e.line).toBe(2);
      expect(e.column).toBeGreaterThan(0);
    }
  });
  test('macro errors include line and column', () => {
    try {
      expand('a\n%nope');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(XDONMacroError);
      const e = err as XDONMacroError;
      expect(e.line).toBe(2);
    }
  });
});
