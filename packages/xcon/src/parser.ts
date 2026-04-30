import {
  XCONDocument,
  HeaderNode,
  BodyNode,
  RowNode,
  DocumentNode,
  FieldValueNode,
  LabelNode,
  ValueNode,
  ArrayNode,
  ParseOptions,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_LENGTH,
  DEFAULT_MAX_ROWS,
} from './ast';
import { tokenize, Token, TokenType } from './tokenizer';
import { XCONParseError } from './errors';
import { inferType } from './evaluator';

const SUPPORTED_VERSION_MAJOR = 1;

class Parser {
  private tokens: Token[];

  private pos = 0;

  private maxDepth: number;

  private maxRows: number;

  constructor(tokens: Token[], maxDepth: number, maxRows: number) {
    this.tokens = tokens;
    this.maxDepth = maxDepth;
    this.maxRows = maxRows;
  }

  private current(): Token {
    return this.tokens[this.pos]!;
  }

  private peek(offset = 1): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private advance(): Token {
    return this.tokens[this.pos++]!;
  }

  private expect(type: TokenType, hint?: string): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new XCONParseError(
        `Expected ${hint ?? type} but got ${token.type === TokenType.EOF ? 'end of input' : token.type}` +
          (token.value && token.type !== TokenType.EOF ? ` ('${token.value}')` : ''),
        token.line,
        token.column,
      );
    }
    return this.advance();
  }

  private skipNewlines(): void {
    while (this.current().type === TokenType.NEWLINE) {
      this.advance();
    }
  }

  parse(): XCONDocument {
    this.skipNewlines();

    let versionDirective: string | null = null;

    if (this.current().type === TokenType.DIRECTIVE) {
      versionDirective = this.parseDirective();
      this.skipNewlines();
    }

    let header: HeaderNode | null = null;
    if (this.current().type === TokenType.LPAREN) {
      header = this.parseHeader();
      this.skipNewlines();
    }

    const body = this.parseBody();

    return {
      type: 'XCONDocument',
      header,
      body,
      versionDirective,
    };
  }

  private parseDirective(): string {
    const tok = this.advance();
    const directive = tok.value.trim();
    // Format: !XCON MAJOR.MINOR
    const m = /^!XCON\s+(\d+)\.(\d+)\s*$/.exec(directive);
    if (!m) {
      throw new XCONParseError(
        `Unknown directive: '${directive}'`,
        tok.line,
        tok.column,
      );
    }
    const major = parseInt(m[1]!, 10);
    if (major !== SUPPORTED_VERSION_MAJOR) {
      throw new XCONParseError(
        `Unsupported XCON version '${m[1]}.${m[2]}' — this parser supports v${SUPPORTED_VERSION_MAJOR}.x`,
        tok.line,
        tok.column,
      );
    }
    return directive;
  }

  private parseHeader(): HeaderNode {
    this.expect(TokenType.LPAREN, '(');
    const labels = this.parseLabelList();
    this.expect(TokenType.RPAREN, ')');
    return { type: 'Header', labels };
  }

  private parseLabelList(): LabelNode[] {
    const labels: LabelNode[] = [];
    labels.push(this.parseLabel());
    while (this.current().type === TokenType.COMMA) {
      this.advance();
      if (this.current().type === TokenType.RPAREN) {
        throw new XCONParseError(
          'Trailing comma not allowed in header',
          this.current().line,
          this.current().column,
        );
      }
      labels.push(this.parseLabel());
    }
    return labels;
  }

  private parseLabel(): LabelNode {
    const tok = this.current();
    if (tok.type !== TokenType.LABEL_OR_VALUE && tok.type !== TokenType.QUOTED_STRING) {
      throw new XCONParseError(
        `Expected label name but got ${tok.type === TokenType.EOF ? 'end of input' : tok.type}`,
        tok.line,
        tok.column,
      );
    }
    this.advance();

    let isArray = false;
    let children: LabelNode[] = [];

    if (this.current().type === TokenType.ARRAY_MARKER) {
      this.advance();
      isArray = true;
    }

    if (this.current().type === TokenType.COLON) {
      this.advance();
      this.expect(TokenType.LPAREN, '( for nested schema');
      children = this.parseLabelList();
      this.expect(TokenType.RPAREN, ')');
    }

    return {
      type: 'Label',
      name: tok.value,
      isArray,
      children,
    };
  }

  private parseBody(): BodyNode {
    const rows: RowNode[] = [];

    while (this.current().type !== TokenType.EOF) {
      this.skipNewlines();
      if (this.current().type === TokenType.EOF) break;

      if (rows.length >= this.maxRows) {
        throw new XCONParseError(
          `Document exceeds maxRows limit (${this.maxRows})`,
          this.current().line,
          this.current().column,
        );
      }

      rows.push(this.parseRow());
      this.skipNewlines();
    }

    return { type: 'Body', rows };
  }

  private parseRow(): RowNode {
    let label: string | null = null;
    let labelLine = this.current().line;
    let labelColumn = this.current().column;

    if (
      (this.current().type === TokenType.LABEL_OR_VALUE ||
        this.current().type === TokenType.QUOTED_STRING) &&
      this.peek()?.type === TokenType.COLON
    ) {
      const labelTok = this.advance();
      label = labelTok.value;
      labelLine = labelTok.line;
      labelColumn = labelTok.column;
      this.expect(TokenType.COLON, ':');
    }

    let document: DocumentNode;
    if (this.current().type === TokenType.LBRACE) {
      document = this.parseDocument(0);
    } else if (this.current().type === TokenType.LBRACKET) {
      // Bare-array row body: wrap in a synthetic document with a single array field.
      const arr = this.parseArray(0);
      document = { type: 'Document', fields: [arr] };
    } else {
      const tok = this.current();
      throw new XCONParseError(
        `Expected row body '{' but got ${tok.type === TokenType.EOF ? 'end of input' : tok.type}` +
          (tok.value && tok.type !== TokenType.EOF ? ` ('${tok.value}')` : ''),
        tok.line,
        tok.column,
      );
    }

    return {
      type: 'Row',
      label,
      labelLine,
      labelColumn,
      document,
    };
  }

  private parseDocument(depth: number): DocumentNode {
    if (depth >= this.maxDepth) {
      const tok = this.current();
      throw new XCONParseError(
        `Document nesting depth exceeds maxDepth (${this.maxDepth})`,
        tok.line,
        tok.column,
      );
    }
    this.expect(TokenType.LBRACE, '{');

    const fields: FieldValueNode[] = [];

    while (this.current().type !== TokenType.RBRACE) {
      if (this.current().type === TokenType.EOF) {
        throw new XCONParseError(
          "Unexpected end of input — expected '}' to close document",
          this.current().line,
          this.current().column,
        );
      }
      fields.push(this.parseFieldValue(depth + 1));

      if (this.current().type === TokenType.COMMA) {
        this.advance();
        if (this.current().type === TokenType.RBRACE) {
          throw new XCONParseError(
            'Trailing comma not allowed',
            this.current().line,
            this.current().column,
          );
        }
      } else if (this.current().type !== TokenType.RBRACE) {
        const tok = this.current();
        throw new XCONParseError(
          `Expected ',' or '}' but got ${tok.type === TokenType.EOF ? 'end of input' : tok.type}` +
            (tok.value && tok.type !== TokenType.EOF ? ` ('${tok.value}')` : ''),
          tok.line,
          tok.column,
        );
      }
    }

    this.expect(TokenType.RBRACE, '}');

    return { type: 'Document', fields };
  }

  private parseFieldValue(depth: number): FieldValueNode {
    if (this.current().type === TokenType.LBRACE) {
      return this.parseDocument(depth);
    }
    if (this.current().type === TokenType.LBRACKET) {
      return this.parseArray(depth);
    }
    // Empty value
    if (this.current().type === TokenType.COMMA || this.current().type === TokenType.RBRACE) {
      return { type: 'Value', raw: '', quoted: false };
    }
    if (
      this.current().type === TokenType.LABEL_OR_VALUE ||
      this.current().type === TokenType.QUOTED_STRING
    ) {
      const token = this.advance();
      return { type: 'Value', raw: token.value, quoted: token.quoted };
    }
    const tok = this.current();
    throw new XCONParseError(
      `Unexpected token: ${tok.type === TokenType.EOF ? 'end of input' : tok.type}` +
        (tok.value && tok.type !== TokenType.EOF ? ` ('${tok.value}')` : ''),
      tok.line,
      tok.column,
    );
  }

  private parseArray(depth: number): ArrayNode {
    if (depth >= this.maxDepth) {
      const tok = this.current();
      throw new XCONParseError(
        `Array nesting depth exceeds maxDepth (${this.maxDepth})`,
        tok.line,
        tok.column,
      );
    }
    this.expect(TokenType.LBRACKET, '[');

    const items: FieldValueNode[] = [];

    while (this.current().type !== TokenType.RBRACKET) {
      if (this.current().type === TokenType.EOF) {
        throw new XCONParseError(
          "Unexpected end of input — expected ']' to close array",
          this.current().line,
          this.current().column,
        );
      }
      items.push(this.parseFieldValue(depth + 1));

      if (this.current().type === TokenType.COMMA) {
        this.advance();
        if (this.current().type === TokenType.RBRACKET) {
          throw new XCONParseError(
            'Trailing comma not allowed',
            this.current().line,
            this.current().column,
          );
        }
      } else if (this.current().type !== TokenType.RBRACKET) {
        const tok = this.current();
        throw new XCONParseError(
          `Expected ',' or ']' but got ${tok.type === TokenType.EOF ? 'end of input' : tok.type}` +
            (tok.value && tok.type !== TokenType.EOF ? ` ('${tok.value}')` : ''),
          tok.line,
          tok.column,
        );
      }
    }
    this.expect(TokenType.RBRACKET, ']');

    return { type: 'Array', items };
  }
}

export function parseToAST(input: string, options?: ParseOptions): XCONDocument {
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  if (input.length > maxLength) {
    throw new XCONParseError(
      `Input exceeds maxLength limit (${maxLength} bytes)`,
      1,
      1,
    );
  }
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const tokens = tokenize(input);
  const parser = new Parser(tokens, maxDepth, maxRows);
  return parser.parse();
}

export function parse(
  input: string,
  options?: ParseOptions,
): Record<string, unknown> | unknown[] {
  const ast = parseToAST(input, options);
  return evaluate(ast);
}

function evaluate(doc: XCONDocument): Record<string, unknown> | unknown[] {
  if (doc.body.rows.length === 0) {
    return doc.header ? {} : [];
  }

  const hasLabels = doc.body.rows.some((r) => r.label !== null);
  const allHaveLabels = doc.body.rows.every((r) => r.label !== null);

  if (hasLabels && !allHaveLabels) {
    const offending = doc.body.rows.find(
      (r, idx) => (idx > 0 ? r.label === null : false) || (idx === 0 && r.label === null),
    ) ?? doc.body.rows[0]!;
    throw new XCONParseError(
      'Mixed labeled and unlabeled rows',
      offending.labelLine,
      offending.labelColumn,
    );
  }

  if (hasLabels) {
    const result: Record<string, unknown> = {};
    for (const row of doc.body.rows) {
      const value = evaluateDocument(row.document, doc.header?.labels ?? [], row.labelLine, row.labelColumn);
      result[row.label!] = value;
    }
    return result;
  }

  const result: unknown[] = [];
  for (const row of doc.body.rows) {
    const value = evaluateDocument(row.document, doc.header?.labels ?? [], row.labelLine, row.labelColumn);
    result.push(value);
  }
  return result;
}

function evaluateDocument(
  doc: DocumentNode,
  schema: LabelNode[],
  line: number,
  column: number,
): Record<string, unknown> | unknown[] {
  // Empty document {} always produces []
  if (doc.fields.length === 0) {
    return [];
  }

  if (schema.length === 0) {
    return doc.fields.map((f) => evaluateFieldValue(f, [], line, column));
  }

  // Apply schema positionally
  const result: Record<string, unknown> = {};
  for (let i = 0; i < schema.length; i++) {
    const label = schema[i]!;
    if (i >= doc.fields.length) {
      result[label.name] = label.isArray ? [] : null;
      continue;
    }
    const field = doc.fields[i]!;
    const evaluated = evaluateFieldValue(field, label.children, line, column);

    if (label.isArray) {
      if (Array.isArray(evaluated)) {
        // If field has nested children (array-of-objects), each item should be an object
        if (label.children.length > 0) {
          // Items came through evaluateFieldValue already; if items are documents,
          // they were eval'd with schema [] (no children) — re-evaluate with children.
          result[label.name] = (field as ArrayNode).items.map((item) =>
            evaluateFieldValue(item, label.children, line, column),
          );
        } else {
          result[label.name] = evaluated;
        }
      } else if (field.type === 'Value' && (field as ValueNode).raw === '' && !(field as ValueNode).quoted) {
        // Empty unquoted value in array slot -> empty array
        result[label.name] = [];
      } else {
        throw new XCONParseError(
          `Field '${label.name}' is declared as an array but received a non-array value`,
          line,
          column,
        );
      }
    } else if (label.children.length > 0) {
      if (field.type !== 'Document' && !(field.type === 'Value' && (field as ValueNode).raw === '' && !(field as ValueNode).quoted)) {
        throw new XCONParseError(
          `Field '${label.name}' is declared as a nested document but received a scalar`,
          line,
          column,
        );
      }
      result[label.name] = evaluated;
    } else {
      result[label.name] = evaluated;
    }
  }
  return result;
}

function evaluateFieldValue(
  field: FieldValueNode,
  schema: LabelNode[],
  line: number,
  column: number,
): unknown {
  if (field.type === 'Value') {
    if (field.quoted) {
      return field.raw;
    }
    if (field.raw === '') return '';
    return inferType(field.raw);
  }
  if (field.type === 'Array') {
    return field.items.map((item) => evaluateFieldValue(item, schema, line, column));
  }
  if (field.type === 'Document') {
    return evaluateDocument(field, schema, line, column);
  }
  return null;
}
