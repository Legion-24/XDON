export enum TokenType {
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COLON = 'COLON',
  COMMA = 'COMMA',
  LABEL_OR_VALUE = 'LABEL_OR_VALUE',
  QUOTED_STRING = 'QUOTED_STRING',
  ARRAY_MARKER = 'ARRAY_MARKER',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const current = (): string | undefined => input[i];
  const peek = (offset = 1): string | undefined => input[i + offset];
  const advance = (): void => {
    if (input[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
    i++;
  };

  const skipWhitespace = (): void => {
    while (current() && /[ \t\r]/.test(current()!)) {
      advance();
    }
  };

  const readQuotedString = (quote: string): string => {
    advance();
    let value = '';
    while (current() && current() !== quote) {
      if (current() === '\\') {
        advance();
        const escaped = current();
        if (escaped === 'n') value += '\n';
        else if (escaped === 't') value += '\t';
        else if (escaped === '\\') value += '\\';
        else if (escaped === quote) value += quote;
        else value += escaped;
        advance();
      } else {
        value += current();
        advance();
      }
    }
    if (current() === quote) advance();
    return value;
  };

  const readBareWord = (): string => {
    let value = '';
    while (current() && /[a-zA-Z0-9_]/.test(current()!)) {
      value += current();
      advance();
    }
    return value;
  };

  const readUnquotedValue = (): string => {
    let value = '';
    while (
      current() &&
      current() !== ',' &&
      current() !== '{' &&
      current() !== '}' &&
      current() !== '[' &&
      current() !== ']' &&
      current() !== '\n' &&
      /\S/.test(current()!)
    ) {
      if (current() === '\\') {
        advance();
        const escaped = current();
        if (escaped === 'n') value += '\n';
        else if (escaped === 't') value += '\t';
        else if (escaped === '\\') value += '\\';
        else if (escaped === ',') value += ',';
        else if (escaped === '{') value += '{';
        else if (escaped === '}') value += '}';
        else if (escaped === '[') value += '[';
        else if (escaped === ']') value += ']';
        else if (escaped === ':') value += ':';
        else value += escaped;
        advance();
      } else {
        value += current();
        advance();
      }
    }
    return value.trimEnd();
  };

  while (i < input.length) {
    skipWhitespace();

    if (i >= input.length) break;

    const ch = current();
    const startLine = line;
    const startColumn = column;

    if (ch === '(') {
      tokens.push({
        type: TokenType.LPAREN,
        value: '(',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === ')') {
      tokens.push({
        type: TokenType.RPAREN,
        value: ')',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === '{') {
      tokens.push({
        type: TokenType.LBRACE,
        value: '{',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === '}') {
      tokens.push({
        type: TokenType.RBRACE,
        value: '}',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === '[') {
      tokens.push({
        type: TokenType.LBRACKET,
        value: '[',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === ']') {
      tokens.push({
        type: TokenType.RBRACKET,
        value: ']',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === ':') {
      tokens.push({
        type: TokenType.COLON,
        value: ':',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === ',') {
      tokens.push({
        type: TokenType.COMMA,
        value: ',',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === '\n') {
      tokens.push({
        type: TokenType.NEWLINE,
        value: '\n',
        line: startLine,
        column: startColumn,
      });
      advance();
    } else if (ch === '"' || ch === "'") {
      const value = readQuotedString(ch);
      tokens.push({
        type: TokenType.QUOTED_STRING,
        value,
        line: startLine,
        column: startColumn,
      });
    } else if (ch && /[a-zA-Z0-9_]/.test(ch)) {
      const value = readBareWord();

      // Check for array marker
      if (current() === '[' && peek() === ']') {
        tokens.push({
          type: TokenType.LABEL_OR_VALUE,
          value,
          line: startLine,
          column: startColumn,
        });
        advance();
        advance();
        tokens.push({
          type: TokenType.ARRAY_MARKER,
          value: '[]',
          line,
          column: column - 2,
        });
      } else {
        tokens.push({
          type: TokenType.LABEL_OR_VALUE,
          value,
          line: startLine,
          column: startColumn,
        });
      }
    } else {
      // Unknown character, try to read as unquoted value
      const value = readUnquotedValue();
      if (value) {
        tokens.push({
          type: TokenType.LABEL_OR_VALUE,
          value,
          line: startLine,
          column: startColumn,
        });
      }
    }
  }

  tokens.push({
    type: TokenType.EOF,
    value: '',
    line,
    column,
  });

  return tokens;
}
