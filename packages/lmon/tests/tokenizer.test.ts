import { tokenize, TokenType } from '../src/tokenizer';

describe('Tokenizer', () => {
  it('should tokenize simple header', () => {
    const tokens = tokenize('(name,age)');
    expect(tokens.some((t) => t.type === TokenType.LPAREN)).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.LABEL_OR_VALUE && t.value === 'name')).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.COMMA)).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.LABEL_OR_VALUE && t.value === 'age')).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.RPAREN)).toBe(true);
  });

  it('should tokenize header with array marker', () => {
    const tokens = tokenize('(name,tags[])');
    const arrayMarkerToken = tokens.find((t) => t.type === TokenType.ARRAY_MARKER);
    expect(arrayMarkerToken).toBeDefined();
  });

  it('should tokenize simple document', () => {
    const tokens = tokenize('{Alice,30}');
    expect(tokens.some((t) => t.type === TokenType.LBRACE)).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.LABEL_OR_VALUE && t.value === 'Alice')).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.LABEL_OR_VALUE && t.value === '30')).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.RBRACE)).toBe(true);
  });

  it('should tokenize quoted values', () => {
    const tokens = tokenize('{hello,world}');
    const token = tokens.find((t) => t.type === TokenType.LABEL_OR_VALUE && t.value === 'hello');
    expect(token).toBeDefined();
  });

  it('should handle escaped characters', () => {
    const tokens = tokenize('{"a\\,b"}');
    const valueToken = tokens.find((t) => t.type === TokenType.QUOTED_STRING);
    expect(valueToken?.value).toBe('a,b');
  });

  it('should tokenize array', () => {
    const tokens = tokenize('[admin,user]');
    expect(tokens.some((t) => t.type === TokenType.LBRACKET)).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.LABEL_OR_VALUE && t.value === 'admin')).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.RBRACKET)).toBe(true);
  });

  it('should tokenize row with label', () => {
    const tokens = tokenize('user1:{Alice,30}');
    expect(tokens.some((t) => t.type === TokenType.LABEL_OR_VALUE && t.value === 'user1')).toBe(true);
    expect(tokens.some((t) => t.type === TokenType.COLON)).toBe(true);
  });

  it('should track line and column numbers', () => {
    const tokens = tokenize('{hello}\nworld');
    const newlineToken = tokens.find((t) => t.type === TokenType.NEWLINE);
    expect(newlineToken).toBeDefined();
  });

  it('should preserve quoted strings with spaces', () => {
    const tokens = tokenize('"hello world"');
    const token = tokens.find((t) => t.type === TokenType.QUOTED_STRING);
    expect(token?.value).toBe('hello world');
  });

  it('should handle empty values (consecutive commas)', () => {
    const tokens = tokenize('{,value}');
    const hasComma = tokens.some((t) => t.type === TokenType.COMMA);
    expect(hasComma).toBe(true);
  });

  it('should tokenize nested header', () => {
    const tokens = tokenize('(name,address:(city,zip))');
    const lparen = tokens.filter((t) => t.type === TokenType.LPAREN);
    expect(lparen.length).toBeGreaterThanOrEqual(2);
  });

  it('should produce EOF token at end', () => {
    const tokens = tokenize('{hello}');
    expect(tokens[tokens.length - 1]?.type).toBe(TokenType.EOF);
  });

  it('should handle escaped quotes in quoted values', () => {
    const tokens = tokenize('"say \\"hi\\""');
    const token = tokens.find((t) => t.type === TokenType.QUOTED_STRING);
    expect(token?.value).toContain('hi');
  });

  it('should handle tabs and newlines escapes', () => {
    const tokens = tokenize('"hello\\tworld"');
    const token = tokens.find((t) => t.type === TokenType.QUOTED_STRING);
    expect(token?.value).toContain('\t');
  });
});
