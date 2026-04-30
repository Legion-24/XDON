import { stringify } from '../src/stringifier';

describe('Stringifier', () => {
  it('should stringify simple object', () => {
    const obj = { user1: { name: 'Alice', age: 30 } };
    const result = stringify(obj);
    expect(result).toContain('(name,age)');
    expect(result).toContain('user1:');
    expect(result).toContain('Alice');
    expect(result).toContain('30');
  });

  it('should stringify object without row labels as array', () => {
    const obj = [{ name: 'Alice', age: 30 }];
    const result = stringify(obj);
    expect(result).toContain('(name,age)');
    expect(result).not.toContain(':');
  });

  it('should stringify arrays in data', () => {
    const obj = { user1: { name: 'Alice', tags: ['admin', 'user'] } };
    const result = stringify(obj);
    expect(result).toContain('tags[]');
    expect(result).toContain('[admin,user]');
  });

  it('should stringify nested objects', () => {
    const obj = { user1: { name: 'Alice', address: { city: 'NYC' } } };
    const result = stringify(obj);
    expect(result).toContain('address:(city)');
    expect(result).toContain('{NYC}');
  });

  it('should stringify null values', () => {
    const obj = { row1: { name: 'Alice', age: null } };
    const result = stringify(obj);
    expect(result).toContain('null');
  });

  it('should escape special characters', () => {
    const obj = { row1: { desc: 'A,B,C' } };
    const result = stringify(obj);
    expect(result).toContain('A,B,C');
  });

  it('should quote values with spaces', () => {
    const obj = { row1: { name: 'Alice Smith' } };
    const result = stringify(obj);
    expect(result).toContain('Alice Smith');
  });

  it('should handle empty array', () => {
    const obj = { row1: { tags: [] } };
    const result = stringify(obj);
    expect(result).toContain('tags[]');
    expect(result).toContain('[]');
  });

  it('should handle empty string', () => {
    const obj = { row1: { name: '' } };
    const result = stringify(obj);
    expect(result).toBeDefined();
  });

  it('should stringify numbers correctly', () => {
    const obj = { row1: { int: 42, float: 3.14 } };
    const result = stringify(obj);
    expect(result).toContain('42');
    expect(result).toContain('3.14');
  });

  it('should stringify booleans correctly', () => {
    const obj = { row1: { active: true, deleted: false } };
    const result = stringify(obj);
    expect(result).toContain('true');
    expect(result).toContain('false');
  });
});
