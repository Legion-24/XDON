import { XCONMacroError } from './errors.js';

export interface MacroDefinition {
  body: string;
  params: string[] | null;
  sourceLine: number;
}

export type MacroContext = Map<string, MacroDefinition>;

export interface ExpandOptions {
  initialContext?: MacroContext;
  strict?: boolean;
  maxDepth?: number;
  /**
   * Allowlist for `%_ENV(VAR)`. Default: empty array (no env access).
   * Pass `'*'` to allow all environment variables (NOT recommended for untrusted input).
   */
  envAllowlist?: string[] | '*';
}

const BUILTIN_NAMES = new Set([
  '_DATE_STR',
  '_TIME_STR',
  '_DATETIME_STR',
  '_TIMESTAMP',
  '_DAY_STR',
  '_UUID',
  '_ENV',
]);

enum ExprTokenType {
  NUMBER = 'NUMBER',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  STAR = 'STAR',
  SLASH = 'SLASH',
  PERCENT = 'PERCENT',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  EOF = 'EOF',
}

interface ExprToken {
  type: ExprTokenType;
  value: string;
}

class ExprEvaluator {
  private tokens: ExprToken[] = [];

  private pos = 0;

  evaluate(expr: string, line: number, col: number): number {
    this.tokens = this.lexExpr(expr, line, col);
    this.pos = 0;
    const result = this.parseAddExpr(line, col);
    if (this.current().type !== ExprTokenType.EOF) {
      throw new XCONMacroError(
        `Unexpected token in expression: '${this.current().value}'`,
        line,
        col,
      );
    }
    return result;
  }

  private lexExpr(expr: string, line: number, col: number): ExprToken[] {
    const tokens: ExprToken[] = [];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (ch === undefined) break;
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === '+') tokens.push({ type: ExprTokenType.PLUS, value: '+' });
      else if (ch === '-') tokens.push({ type: ExprTokenType.MINUS, value: '-' });
      else if (ch === '*') tokens.push({ type: ExprTokenType.STAR, value: '*' });
      else if (ch === '/') tokens.push({ type: ExprTokenType.SLASH, value: '/' });
      else if (ch === '%') tokens.push({ type: ExprTokenType.PERCENT, value: '%' });
      else if (ch === '(') tokens.push({ type: ExprTokenType.LPAREN, value: '(' });
      else if (ch === ')') tokens.push({ type: ExprTokenType.RPAREN, value: ')' });
      else if (
        /\d/.test(ch) ||
        (ch === '.' && i + 1 < expr.length && /\d/.test(expr[i + 1] || ''))
      ) {
        let numStr = '';
        let dotSeen = false;
        while (
          i < expr.length &&
          (/\d/.test(expr[i] || '') || (expr[i] === '.' && !dotSeen))
        ) {
          if (expr[i] === '.') dotSeen = true;
          numStr += expr[i];
          i++;
        }
        tokens.push({ type: ExprTokenType.NUMBER, value: numStr });
        continue;
      } else {
        throw new XCONMacroError(
          `Unexpected character in expression: '${ch}'`,
          line,
          col,
        );
      }
      i++;
    }
    tokens.push({ type: ExprTokenType.EOF, value: '' });
    return tokens;
  }

  private current(): ExprToken {
    return this.tokens[this.pos] || { type: ExprTokenType.EOF, value: '' };
  }

  private advance(): ExprToken {
    const token = this.tokens[this.pos++];
    return token || { type: ExprTokenType.EOF, value: '' };
  }

  private expect(type: ExprTokenType, line: number, col: number): ExprToken {
    const token = this.current();
    if (token.type !== type) {
      throw new XCONMacroError(`Expected ${type} but got ${token.type}`, line, col);
    }
    return this.advance();
  }

  private parseAddExpr(line: number, col: number): number {
    let left = this.parseMulExpr(line, col);
    while (
      this.current().type === ExprTokenType.PLUS ||
      this.current().type === ExprTokenType.MINUS
    ) {
      const op = this.advance();
      const right = this.parseMulExpr(line, col);
      left = op.type === ExprTokenType.PLUS ? left + right : left - right;
    }
    return left;
  }

  private parseMulExpr(line: number, col: number): number {
    let left = this.parseUnary(line, col);
    while (
      this.current().type === ExprTokenType.STAR ||
      this.current().type === ExprTokenType.SLASH ||
      this.current().type === ExprTokenType.PERCENT
    ) {
      const op = this.advance();
      const right = this.parseUnary(line, col);
      if (op.type === ExprTokenType.STAR) left *= right;
      else if (op.type === ExprTokenType.SLASH) {
        if (right === 0) throw new XCONMacroError('Division by zero in expression', line, col);
        left /= right;
      } else {
        if (right === 0) throw new XCONMacroError('Modulo by zero in expression', line, col);
        left %= right;
      }
    }
    return left;
  }

  private parseUnary(line: number, col: number): number {
    if (this.current().type === ExprTokenType.MINUS) {
      this.advance();
      return -this.parseUnary(line, col);
    }
    return this.parsePrimary(line, col);
  }

  private parsePrimary(line: number, col: number): number {
    if (this.current().type === ExprTokenType.NUMBER) {
      return parseFloat(this.advance().value);
    }
    if (this.current().type === ExprTokenType.LPAREN) {
      this.advance();
      const val = this.parseAddExpr(line, col);
      this.expect(ExprTokenType.RPAREN, line, col);
      return val;
    }
    throw new XCONMacroError(
      `Expected number or '(' in expression, got ${this.current().type}`,
      line,
      col,
    );
  }
}

interface ExpandState {
  context: MacroContext;
  strict: boolean;
  maxDepth: number;
  envAllowlist: Set<string> | 'all';
}

export function expand(input: string, options?: ExpandOptions): string {
  const context: MacroContext = new Map(options?.initialContext ?? []);
  const strict = options?.strict ?? true;
  const maxDepth = options?.maxDepth ?? 16;

  let envAllowlist: Set<string> | 'all';
  if (options?.envAllowlist === '*') envAllowlist = 'all';
  else envAllowlist = new Set(options?.envAllowlist ?? []);

  const state: ExpandState = { context, strict, maxDepth, envAllowlist };

  const lines = input.split('\n');
  const outputLines: string[] = [];
  const trailingNewline = input.endsWith('\n');

  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1] || '';
    const defMatch = line.match(
      /^\s*%([a-zA-Z_][a-zA-Z0-9_]*)(?:\(([^)]*)\))?\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/,
    );

    if (defMatch) {
      const name = defMatch[1] || '';
      const paramStr = defMatch[2] || '';
      const rawBody = defMatch[3] || '';

      const params =
        paramStr.length > 0
          ? paramStr
              .split(',')
              .map((p) => p.trim())
              .filter((p) => p.length > 0)
          : null;

      const body = decodeEscapes(rawBody);

      context.set(name, {
        body,
        params: params && params.length > 0 ? params : null,
        sourceLine: lineNum,
      });
    } else {
      const expanded = expandLine(line, state, lineNum, 0);
      outputLines.push(expanded);
    }
  }

  let result = outputLines.join('\n');
  if (trailingNewline) result += '\n';
  return result;
}

function decodeEscapes(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === '"') out += '"';
      else if (next === '\\') out += '\\';
      else if (next === 'n') out += '\n';
      else if (next === 't') out += '\t';
      else out += next || '';
      i += 2;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function generateUUID(): string {
  // Requires globalThis.crypto.randomUUID — Node 18+ and all modern browsers.
  return (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto.randomUUID();
}

function expandBuiltin(name: string, args: string[] | null, allowlist: Set<string> | 'all'): string {
  const now = new Date();
  if (name === '_DATE_STR') {
    return now.toISOString().split('T')[0] || '';
  }
  if (name === '_TIME_STR') {
    return now.toISOString().slice(11, 19);
  }
  if (name === '_DATETIME_STR') {
    return now.toISOString();
  }
  if (name === '_TIMESTAMP') {
    return String(Math.floor(now.getTime() / 1000));
  }
  if (name === '_DAY_STR') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[now.getUTCDay()] || '';
  }
  if (name === '_UUID') {
    return generateUUID();
  }
  if (name === '_ENV') {
    const varName = args?.[0] ?? '';
    if (varName === '') return '';
    if (allowlist !== 'all' && !allowlist.has(varName)) return '';
    const env: any = (globalThis as any).process?.env;
    if (env && typeof env === 'object' && Object.prototype.hasOwnProperty.call(env, varName)) {
      const v = env[varName];
      return typeof v === 'string' ? v : '';
    }
    return '';
  }
  return '';
}

/**
 * Find the matching close-paren for the open-paren at `openIdx` in `s`.
 * Honors backslash-escaped parens.
 */
function findMatchingParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let k = openIdx; k < s.length; k++) {
    const ch = s[k];
    if (ch === '\\' && k + 1 < s.length) {
      k++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/**
 * Split a comma-separated argument string honoring nested parens/braces/brackets and escapes.
 */
function splitArgs(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '\\' && k + 1 < s.length) {
      cur += ch + s[k + 1];
      k++;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur.trim());
  // If the input was empty string, return empty list (no args).
  if (parts.length === 1 && parts[0] === '') return [];
  return parts;
}

/**
 * Substitute parameters into a body using a single-pass scan. Sorts param
 * names by length descending so that prefix collisions don't corrupt longer
 * placeholder names.
 */
function substituteParams(body: string, params: string[], args: string[]): string {
  const paramMap = new Map<string, string>();
  for (let k = 0; k < params.length; k++) {
    paramMap.set(params[k]!, args[k] ?? '');
  }
  // Build a regex that matches any {param} placeholder, preferring longer names.
  const sortedNames = [...paramMap.keys()].sort((a, b) => b.length - a.length);
  if (sortedNames.length === 0) return body;
  const pattern = new RegExp(
    `\\{(${sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\}`,
    'g',
  );
  return body.replace(pattern, (_m, p1) => paramMap.get(p1) ?? '');
}

function expandLine(
  line: string,
  state: ExpandState,
  lineNum: number,
  depth: number,
): string {
  if (depth > state.maxDepth) {
    throw new XCONMacroError('Macro expansion depth exceeded', lineNum, 1);
  }

  let result = '';
  let i = 0;

  while (i < line.length) {
    if (line[i] === '%') {
      if (i + 1 < line.length && line[i + 1] === '{') {
        const closeIdx = line.indexOf('}', i + 2);
        if (closeIdx === -1) {
          throw new XCONMacroError(
            'Unclosed expression macro %{...}',
            lineNum,
            i + 1,
          );
        }
        let exprStr = line.substring(i + 2, closeIdx);
        exprStr = expandLine(exprStr, state, lineNum, depth + 1);
        const evaluator = new ExprEvaluator();
        const exprResult = evaluator.evaluate(exprStr, lineNum, i + 1);
        const stringified = Number.isInteger(exprResult)
          ? String(Math.trunc(exprResult))
          : String(exprResult);
        result += stringified;
        i = closeIdx + 1;
        continue;
      }

      const nameMatch = line.substring(i + 1).match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (!nameMatch) {
        result += '%';
        i++;
        continue;
      }

      const name = nameMatch[1] || '';
      let nextIdx = i + 1 + name.length;
      let args: string[] | null = null;

      if (nextIdx < line.length && line[nextIdx] === '(') {
        const closeParenIdx = findMatchingParen(line, nextIdx);
        if (closeParenIdx === -1) {
          throw new XCONMacroError(
            `Unclosed parameter list for macro '${name}'`,
            lineNum,
            nextIdx + 1,
            name,
          );
        }
        const argStr = line.substring(nextIdx + 1, closeParenIdx);
        args = argStr.length > 0 ? splitArgs(argStr) : [];
        // Recursively expand each argument
        args = args.map((a) => expandLine(a, state, lineNum, depth + 1));
        nextIdx = closeParenIdx + 1;
      }

      // User-defined override takes precedence
      const userDef = state.context.get(name);

      if (userDef) {
        if (userDef.params === null && args && args.length > 0) {
          throw new XCONMacroError(
            `Macro '${name}' takes no parameters, but ${args.length} provided`,
            lineNum,
            i + 1,
            name,
          );
        }
        if (userDef.params !== null && (!args || args.length !== userDef.params.length)) {
          const expected = userDef.params.length;
          const got = args?.length ?? 0;
          throw new XCONMacroError(
            `Macro '${name}' expects ${expected} arguments, got ${got}`,
            lineNum,
            i + 1,
            name,
          );
        }
        let body = userDef.body;
        if (userDef.params && args) {
          body = substituteParams(body, userDef.params, args);
        }
        result += expandLine(body, state, lineNum, depth + 1);
        i = nextIdx;
        continue;
      }

      if (BUILTIN_NAMES.has(name)) {
        result += expandBuiltin(name, args, state.envAllowlist);
        i = nextIdx;
        continue;
      }

      // Unknown macro
      if (state.strict) {
        throw new XCONMacroError(
          `Undefined macro '${name}'`,
          lineNum,
          i + 1,
          name,
        );
      }
      result += `%${name}${args ? `(${args.join(',')})` : ''}`;
      i = nextIdx;
    } else {
      result += line[i];
      i++;
    }
  }
  return result;
}
