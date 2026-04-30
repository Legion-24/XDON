import { inferType } from '../src/evaluator';

describe('Type Inference', () => {
  it('should infer null', () => {
    expect(inferType('null')).toBeNull();
  });

  it('should infer true boolean', () => {
    expect(inferType('true')).toBe(true);
  });

  it('should infer false boolean', () => {
    expect(inferType('false')).toBe(false);
  });

  it('should infer positive integer', () => {
    const result = inferType('42');
    expect(result).toBe(42);
    expect(typeof result).toBe('number');
  });

  it('should infer negative integer', () => {
    expect(inferType('-42')).toBe(-42);
  });

  it('should infer zero', () => {
    expect(inferType('0')).toBe(0);
  });

  it('should infer positive float', () => {
    const result = inferType('3.14');
    expect(result).toBe(3.14);
    expect(typeof result).toBe('number');
  });

  it('should infer negative float', () => {
    expect(inferType('-3.14')).toBe(-3.14);
  });

  it('should infer string for non-matching input', () => {
    expect(inferType('hello')).toBe('hello');
  });

  it('should infer string for scientific notation', () => {
    expect(inferType('1e5')).toBe('1e5');
  });

  it('should infer string for NaN', () => {
    expect(inferType('NaN')).toBe('NaN');
  });

  it('should infer string for Infinity', () => {
    expect(inferType('Infinity')).toBe('Infinity');
  });

  it('should infer empty string', () => {
    expect(inferType('')).toBe('');
  });

  it('should infer string with spaces', () => {
    expect(inferType('hello world')).toBe('hello world');
  });

  it('should handle float with leading zero', () => {
    expect(inferType('0.5')).toBe(0.5);
  });

  it('should handle negative zero as integer', () => {
    expect(inferType('-0')).toBe(0);
  });
});
