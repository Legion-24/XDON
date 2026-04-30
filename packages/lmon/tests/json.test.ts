import { toJSON, fromJSON } from '../src/json';
import { parse } from '../src/parser';

describe('JSON Bridge', () => {
  it('should convert LMON to JSON', () => {
    const lmon = '(name,age)\nalice:{Alice,30}';
    const json = toJSON(lmon);
    const parsed = JSON.parse(json);
    expect(parsed.alice.name).toBe('Alice');
    expect(parsed.alice.age).toBe(30);
  });

  it('should convert JSON to LMON', () => {
    const json = JSON.stringify({ user1: { name: 'Alice', age: 30 } });
    const lmon = fromJSON(json);
    expect(lmon).toContain('(name,age)');
    expect(lmon).toContain('user1:');
  });

  it('should round-trip via toJSON', () => {
    const lmon = '(name,age)\nalice:{Alice,30}';
    const json = toJSON(lmon);
    const reparsed = JSON.parse(json);
    expect(reparsed.alice.name).toBe('Alice');
  });

  it('should round-trip via fromJSON', () => {
    const obj = { user1: { name: 'Alice', age: 30 } };
    const json = JSON.stringify(obj);
    const lmon = fromJSON(json);
    const parsed = parse(lmon) as Record<string, unknown>;
    expect((parsed.user1 as Record<string, unknown>).name).toBe('Alice');
  });

  it('should handle arrays in JSON', () => {
    const json = JSON.stringify({
      user1: { name: 'Alice', tags: ['admin', 'user'] },
    });
    const lmon = fromJSON(json);
    expect(lmon).toContain('tags[]');
  });

  it('should handle null in JSON', () => {
    const json = JSON.stringify({
      user1: { name: 'Alice', age: null },
    });
    const lmon = fromJSON(json);
    expect(lmon).toContain('null');
  });
});
