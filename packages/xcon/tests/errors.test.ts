import { XCONParseError, XCONStringifyError } from '../src/errors';

describe('XCONParseError', () => {
  it('should create an error with line and column', () => {
    const err = new XCONParseError('Test error', 5, 10);
    expect(err.message).toContain('Test error');
    expect(err.line).toBe(5);
    expect(err.column).toBe(10);
    expect(err.message).toContain('5:10');
  });

  it('should include source context if provided', () => {
    const err = new XCONParseError('Test error', 1, 1, '{hello}');
    expect(err.source).toBe('{hello}');
  });

  it('should be instanceof Error', () => {
    const err = new XCONParseError('Test', 1, 1);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('XCONStringifyError', () => {
  it('should create an error with message', () => {
    const err = new XCONStringifyError('Stringify failed');
    expect(err.message).toContain('Stringify failed');
  });

  it('should be instanceof Error', () => {
    const err = new XCONStringifyError('Test');
    expect(err).toBeInstanceOf(Error);
  });
});
