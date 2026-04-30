import { toJSON, fromJSON } from '../src/json';
import { parse } from '../src/parser';

describe('JSON Bridge', () => {
  it('should convert XCON to JSON', () => {
    const xcon = '(name,age)\nalice:{Alice,30}';
    const json = toJSON(xcon);
    const parsed = JSON.parse(json);
    expect(parsed.alice.name).toBe('Alice');
    expect(parsed.alice.age).toBe(30);
  });

  it('should convert JSON to XCON', () => {
    const json = JSON.stringify({ user1: { name: 'Alice', age: 30 } });
    const xcon = fromJSON(json);
    expect(xcon).toContain('(name,age)');
    expect(xcon).toContain('user1:');
  });

  it('should round-trip via toJSON', () => {
    const xcon = '(name,age)\nalice:{Alice,30}';
    const json = toJSON(xcon);
    const reparsed = JSON.parse(json);
    expect(reparsed.alice.name).toBe('Alice');
  });

  it('should round-trip via fromJSON', () => {
    const obj = { user1: { name: 'Alice', age: 30 } };
    const json = JSON.stringify(obj);
    const xcon = fromJSON(json);
    const parsed = parse(xcon) as Record<string, unknown>;
    expect((parsed.user1 as Record<string, unknown>).name).toBe('Alice');
  });

  it('should handle arrays in JSON', () => {
    const json = JSON.stringify({
      user1: { name: 'Alice', tags: ['admin', 'user'] },
    });
    const xcon = fromJSON(json);
    expect(xcon).toContain('tags[]');
  });

  it('should handle null in JSON', () => {
    const json = JSON.stringify({
      user1: { name: 'Alice', age: null },
    });
    const xcon = fromJSON(json);
    expect(xcon).toContain('null');
  });
});
