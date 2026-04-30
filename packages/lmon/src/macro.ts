import { LMONMacroError } from './errors';

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
}

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
      throw new LMONMacroError(
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

      if (ch === '+') {
        tokens.push({ type: ExprTokenType.PLUS, value: '+' });
        i++;
      } else if (ch === '-') {
        tokens.push({ type: ExprTokenType.MINUS, value: '-' });
        i++;
      } else if (ch === '*') {
        tokens.push({ type: ExprTokenType.STAR, value: '*' });
        i++;
      } else if (ch === '/') {
        tokens.push({ type: ExprTokenType.SLASH, value: '/' });
        i++;
      } else if (ch === '%') {
        tokens.push({ type: ExprTokenType.PERCENT, value: '%' });
        i++;
      } else if (ch === '(') {
        tokens.push({ type: ExprTokenType.LPAREN, value: '(' });
        i++;
      } else if (ch === ')') {
        tokens.push({ type: ExprTokenType.RPAREN, value: ')' });
        i++;
      } else if (/\d/.test(ch) || (ch === '.' && i + 1 < expr.length && /\d/.test(expr[i + 1] || ''))) {
        let numStr = '';
        while (i < expr.length && (/\d/.test(expr[i] || '') || expr[i] === '.')) {
          numStr += expr[i];
          i++;
        }
        tokens.push({ type: ExprTokenType.NUMBER, value: numStr });
      } else {
        throw new LMONMacroError(`Unexpected character in expression: '${ch}'`, line, col);
      }
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
      throw new LMONMacroError(
        `Expected ${type} but got ${token.type}`,
        line,
        col,
      );
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

      if (op.type === ExprTokenType.STAR) {
        left = left * right;
      } else if (op.type === ExprTokenType.SLASH) {
        if (right === 0) {
          throw new LMONMacroError('Division by zero in expression', line, col);
        }
        left = left / right;
      } else {
        if (right === 0) {
          throw new LMONMacroError('Modulo by zero in expression', line, col);
        }
        left = left % right;
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
      const val = parseFloat(this.advance().value);
      return val;
    }

    if (this.current().type === ExprTokenType.LPAREN) {
      this.advance();
      const val = this.parseAddExpr(line, col);
      this.expect(ExprTokenType.RPAREN, line, col);
      return val;
    }

    throw new LMONMacroError(
      `Expected number or '(' in expression, got ${this.current().type}`,
      line,
      col,
    );
  }
}

export function expand(input: string, options?: ExpandOptions): string {
  const specMacros = buildSpecMacros();
  const context: MacroContext = new Map([...specMacros, ...(options?.initialContext ?? [])]);
  const strict = options?.strict ?? true;
  const maxDepth = options?.maxDepth ?? 16;

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
      const expanded = expandLine(
        line,
        context,
        strict,
        maxDepth,
        lineNum,
        0,
      );
      outputLines.push(expanded);
    }
  }

  let result = outputLines.join('\n');
  if (trailingNewline) {
    result += '\n';
  }
  return result;
}

function decodeEscapes(s: string): string {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

function generateUUID(): string {
  const chars = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += chars[Math.floor(Math.random() * 16) & 0x3 | 0x8];
    } else {
      uuid += chars[Math.floor(Math.random() * 16)];
    }
  }
  return uuid;
}

function buildSpecMacros(): MacroContext {
  const now = new Date();

  const padZero = (n: number): string => String(n).padStart(2, '0');

  const dateStr: string = now.toISOString().split('T')[0] || '';
  const timeStr: string = `${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}`;
  const datetimeStr: string = now.toISOString();

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayStr: string = days[now.getDay()] || 'Sunday';

  const context: MacroContext = new Map();
  context.set('_DATE_STR', { body: dateStr, params: null, sourceLine: 0 });
  context.set('_TIMESTAMP', { body: String(Math.floor(now.getTime() / 1000)), params: null, sourceLine: 0 });
  context.set('_DATETIME_STR', { body: datetimeStr, params: null, sourceLine: 0 });
  context.set('_DAY_STR', { body: dayStr, params: null, sourceLine: 0 });
  context.set('_TIME_STR', { body: timeStr, params: null, sourceLine: 0 });
  context.set('_UUID', { body: generateUUID(), params: null, sourceLine: 0 });
  context.set('_ENV', { body: '', params: ['VAR'], sourceLine: 0 });

  return context;
}

function expandLine(
  line: string,
  context: MacroContext,
  strict: boolean,
  maxDepth: number,
  lineNum: number,
  depth: number,
): string {
  if (depth > maxDepth) {
    throw new LMONMacroError(
      'Macro expansion depth exceeded',
      lineNum,
      1,
    );
  }

  let result = '';
  let i = 0;

  while (i < line.length) {
    if (line[i] === '%') {
      if (i + 1 < line.length && line[i + 1] === '{') {
        const closeIdx = line.indexOf('}', i + 2);
        if (closeIdx === -1) {
          throw new LMONMacroError(
            'Unclosed expression macro %{...}',
            lineNum,
            i + 1,
          );
        }

        let exprStr = line.substring(i + 2, closeIdx);
        exprStr = expandLine(
          exprStr,
          context,
          strict,
          maxDepth,
          lineNum,
          depth + 1,
        );

        const evaluator = new ExprEvaluator();
        const exprResult = evaluator.evaluate(exprStr, lineNum, i + 1);
        const stringified = Number.isInteger(exprResult)
          ? String(Math.floor(exprResult))
          : String(exprResult);

        result += stringified;
        i = closeIdx + 1;
      } else {
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
          const closeParenIdx = line.indexOf(')', nextIdx);
          if (closeParenIdx === -1) {
            throw new LMONMacroError(
              `Unclosed parameter list for macro '${name}'`,
              lineNum,
              nextIdx + 1,
            );
          }

          const argStr = line.substring(nextIdx + 1, closeParenIdx);
          args = argStr.length > 0 ? argStr.split(',').map((a) => a.trim()) : [];
          nextIdx = closeParenIdx + 1;
        }

        const def = context.get(name);

        if (!def) {
          if (strict) {
            throw new LMONMacroError(
              `Undefined macro '${name}'`,
              lineNum,
              i + 1,
              name,
            );
          }
          result += `%${name}${args ? `(${args.join(',')})` : ''}`;
          i = nextIdx;
          continue;
        }

        if (def.params === null && args && args.length > 0) {
          throw new LMONMacroError(
            `Macro '${name}' takes no parameters, but ${args.length} provided`,
            lineNum,
            i + 1,
            name,
          );
        }

        if (def.params !== null && (!args || args.length !== def.params.length)) {
          const expected = def.params.length;
          const got = args?.length ?? 0;
          throw new LMONMacroError(
            `Macro '${name}' expects ${expected} arguments, got ${got}`,
            lineNum,
            i + 1,
            name,
          );
        }

        let substituted: string;

        if (name === '_ENV' && args && args.length > 0) {
          const envVarName = args[0] || '';
          const processEnv = (globalThis as any).process?.env;
          const envValue = (processEnv && typeof processEnv === 'object' && envVarName in processEnv) ? processEnv[envVarName] : '';
          substituted = envValue || '';
        } else {
          let body = def.body;

          if (def.params && args) {
            for (let j = 0; j < def.params.length; j++) {
              const placeholder = `{${def.params[j]}}`;
              const argVal = args[j] || '';
              body = body.replaceAll(placeholder, argVal);
            }
          }

          substituted = expandLine(
            body,
            context,
            strict,
            maxDepth,
            lineNum,
            depth + 1,
          );
        }

        result += substituted;
        i = nextIdx;
      }
    } else {
      result += line[i];
      i++;
    }
  }

  return result;
}
