import { XCONParseError } from './errors';

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
  DIRECTIVE = 'DIRECTIVE',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  /** Whether a LABEL_OR_VALUE / QUOTED_STRING came from a quoted source. */
  quoted: boolean;
}

const RESERVED_LEADING = new Set(['@', '#', '!', '%']);
const DELIMITERS = new Set([',', '{', '}', '[', ']', '(', ')', ':', '\n']);

const isBareWordStart = (ch: string): boolean =>
  (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
const isBareWordChar = (ch: string): boolean =>
  isBareWordStart(ch) || (ch >= '0' && ch <= '9');
const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';

/**
 * Tokenize XCON text into a stream of tokens. Skips a leading UTF-8 BOM.
 * Reserved leading characters (@, #, !, %) cause a parse error in bare position.
 * Directives (lines starting with `!XCON`) are emitted as DIRECTIVE tokens.
 */
export function tokenize(input: string): Token[] {
  // Strip optional UTF-8 BOM.
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

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

  const skipInlineWhitespace = (): void => {
    while (current() !== undefined && (current() === ' ' || current() === '\t' || current() === '\r')) {
      advance();
    }
  };

  const readQuotedString = (quote: string, startLine: number, startColumn: number): string => {
    advance(); // consume opening quote
    let value = '';
    while (current() !== undefined && current() !== quote) {
      const ch = current()!;
      if (ch === '\n') {
        throw new XCONParseError(
          'Unterminated quoted string (newline before closing quote)',
          startLine,
          startColumn,
        );
      }
      if (ch === '\\') {
        advance();
        const escaped = current();
        if (escaped === undefined) {
          throw new XCONParseError(
            'Unterminated escape sequence in quoted string',
            line,
            column,
          );
        }
        if (escaped === 'n') value += '\n';
        else if (escaped === 't') value += '\t';
        else if (escaped === '\\') value += '\\';
        else if (escaped === '"' || escaped === "'") value += escaped;
        else value += escaped;
        advance();
      } else {
        value += ch;
        advance();
      }
    }
    if (current() !== quote) {
      throw new XCONParseError(
        `Unterminated quoted string (expected closing ${quote})`,
        startLine,
        startColumn,
      );
    }
    advance(); // consume closing quote
    return value;
  };

  const readBareValue = (startLine: number, startColumn: number): string => {
    let value = '';
    while (current() !== undefined) {
      const ch = current()!;
      if (DELIMITERS.has(ch)) break;
      if (ch === ' ' || ch === '\t' || ch === '\r') break;
      if (ch === '\\') {
        advance();
        const escaped = current();
        if (escaped === undefined) {
          throw new XCONParseError(
            'Unterminated escape sequence in bare value',
            line,
            column,
          );
        }
        if (escaped === 'n') value += '\n';
        else if (escaped === 't') value += '\t';
        else if (escaped === '\\') value += '\\';
        else value += escaped;
        advance();
        continue;
      }
      if (value.length === 0 && RESERVED_LEADING.has(ch)) {
        throw new XCONParseError(
          `Reserved character '${ch}' at start of bare value (quote or escape it)`,
          startLine,
          startColumn,
        );
      }
      value += ch;
      advance();
    }
    return value;
  };

  // Optionally emit a directive at the very start of input or on a fresh line.
  const tryReadDirective = (): boolean => {
    if (current() !== '!') return false;
    // Look ahead for "XCON " or end-of-token directive name.
    // We're at a line start (or top of file). Read until newline.
    const startLine = line;
    const startColumn = column;
    let directive = '';
    while (current() !== undefined && current() !== '\n') {
      directive += current();
      advance();
    }
    tokens.push({
      type: TokenType.DIRECTIVE,
      value: directive,
      line: startLine,
      column: startColumn,
      quoted: false,
    });
    return true;
  };

  // Track whether we are at the start of a logical line for directive handling.
  let atLineStart = true;

  while (i < input.length) {
    skipInlineWhitespace();

    if (i >= input.length) break;

    const ch = current();
    const startLine = line;
    const startColumn = column;

    // Directive only valid at line start
    if (atLineStart && ch === '!') {
      tryReadDirective();
      continue; // newline (or EOF) handled next iteration
    }

    atLineStart = false;

    if (ch === '(') {
      tokens.push({ type: TokenType.LPAREN, value: '(', line: startLine, column: startColumn, quoted: false });
      advance();
    } else if (ch === ')') {
      tokens.push({ type: TokenType.RPAREN, value: ')', line: startLine, column: startColumn, quoted: false });
      advance();
    } else if (ch === '{') {
      tokens.push({ type: TokenType.LBRACE, value: '{', line: startLine, column: startColumn, quoted: false });
      advance();
    } else if (ch === '}') {
      tokens.push({ type: TokenType.RBRACE, value: '}', line: startLine, column: startColumn, quoted: false });
      advance();
    } else if (ch === '[') {
      tokens.push({ type: TokenType.LBRACKET, value: '[', line: startLine, column: startColumn, quoted: false });
      advance();
    } else if (ch === ']') {
      tokens.push({ type: TokenType.RBRACKET, value: ']', line: startLine, column: startColumn, quoted: false });
      advance();
    } else if (ch === ':') {
      tokens.push({ type: TokenType.COLON, value: ':', line: startLine, column: startColumn, quoted: false });
      advance();
    } else if (ch === ',') {
      tokens.push({ type: TokenType.COMMA, value: ',', line: startLine, column: startColumn, quoted: false });
      advance();
    } else if (ch === '\n') {
      tokens.push({ type: TokenType.NEWLINE, value: '\n', line: startLine, column: startColumn, quoted: false });
      advance();
      atLineStart = true;
    } else if (ch === '"' || ch === "'") {
      const value = readQuotedString(ch, startLine, startColumn);
      tokens.push({
        type: TokenType.QUOTED_STRING,
        value,
        line: startLine,
        column: startColumn,
        quoted: true,
      });
    } else if (ch !== undefined && (isBareWordStart(ch) || isDigit(ch) || ch === '-' || ch === '\\')) {
      // Bare value — letter/digit/underscore/minus/backslash-escape
      const value = readBareValue(startLine, startColumn);
      // Check for array marker [] following an identifier-shaped value
      if (current() === '[' && peek() === ']') {
        tokens.push({
          type: TokenType.LABEL_OR_VALUE,
          value,
          line: startLine,
          column: startColumn,
          quoted: false,
        });
        const markerLine = line;
        const markerColumn = column;
        advance();
        advance();
        tokens.push({
          type: TokenType.ARRAY_MARKER,
          value: '[]',
          line: markerLine,
          column: markerColumn,
          quoted: false,
        });
      } else {
        tokens.push({
          type: TokenType.LABEL_OR_VALUE,
          value,
          line: startLine,
          column: startColumn,
          quoted: false,
        });
      }
    } else if (ch !== undefined) {
      // Reserved leading char (after directive handling) or other illegal char
      if (RESERVED_LEADING.has(ch)) {
        throw new XCONParseError(
          `Reserved character '${ch}' at start of bare value (quote or escape it)`,
          startLine,
          startColumn,
        );
      }
      throw new XCONParseError(
        `Unexpected character: '${ch}'`,
        startLine,
        startColumn,
      );
    }
  }

  tokens.push({ type: TokenType.EOF, value: '', line, column, quoted: false });

  return tokens;
}

/** Verify that a quoted string never appears as a bare value if it contains
 * digits-only or matches a literal — used by parser to honor quoted-vs-bare. */
export function isBareWord(s: string): boolean {
  if (s.length === 0) return false;
  if (!isBareWordStart(s[0]!)) return false;
  for (let k = 1; k < s.length; k++) {
    if (!isBareWordChar(s[k]!)) return false;
  }
  return true;
}
