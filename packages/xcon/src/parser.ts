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
} from './ast';
import { tokenize, Token, TokenType } from './tokenizer';
import { XCONParseError } from './errors';
import { inferType } from './evaluator';

class Parser {
  private tokens: Token[];

  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
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

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new XCONParseError(
        `Expected ${type} but got ${token.type}`,
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

    let header: HeaderNode | null = null;

    // Check for header
    if (this.current().type === TokenType.LPAREN) {
      header = this.parseHeader();
      this.skipNewlines();
    }

    const body = this.parseBody();

    return {
      type: 'XCONDocument',
      header,
      body,
    };
  }

  private parseHeader(): HeaderNode {
    this.expect(TokenType.LPAREN);
    const labels = this.parseLabelList();
    this.expect(TokenType.RPAREN);
    return { type: 'Header', labels };
  }

  private parseLabelList(): LabelNode[] {
    const labels: LabelNode[] = [];

    labels.push(this.parseLabel());

    while (this.current().type === TokenType.COMMA) {
      this.advance();
      labels.push(this.parseLabel());
    }

    return labels;
  }

  private parseLabel(): LabelNode {
    const token = this.expect(TokenType.LABEL_OR_VALUE);
    let isArray = false;
    let children: LabelNode[] = [];

    if (this.current().type === TokenType.ARRAY_MARKER) {
      this.advance();
      isArray = true;
    }

    // Check for nested schema: label:(sublabel,...)
    if (this.current().type === TokenType.COLON) {
      this.advance();
      if (this.current().type === TokenType.LPAREN) {
        this.advance();
        children = this.parseLabelList();
        this.expect(TokenType.RPAREN);
      }
    }

    return {
      type: 'Label',
      name: token.value,
      isArray,
      children,
    };
  }

  private parseBody(): BodyNode {
    const rows: RowNode[] = [];

    while (this.current().type !== TokenType.EOF) {
      this.skipNewlines();
      if (this.current().type === TokenType.EOF) break;

      rows.push(this.parseRow());
      this.skipNewlines();
    }

    return { type: 'Body', rows };
  }

  private parseRow(): RowNode {
    let label: string | null = null;

    // Check for row label (LABEL_OR_VALUE followed by COLON)
    if (
      this.current().type === TokenType.LABEL_OR_VALUE &&
      this.peek()?.type === TokenType.COLON
    ) {
      label = this.advance().value;
      this.expect(TokenType.COLON);
    }

    // Allow bare array as row body, not just a document
    let document: DocumentNode;
    if (this.current().type === TokenType.LBRACKET) {
      const array = this.parseArray();
      document = { type: 'Document', fields: [array] };
    } else {
      document = this.parseDocument();
    }

    return {
      type: 'Row',
      label,
      document,
    };
  }

  private parseDocument(): DocumentNode {
    this.expect(TokenType.LBRACE);

    const fields: FieldValueNode[] = [];

    while (this.current().type !== TokenType.RBRACE) {
      fields.push(this.parseFieldValue());

      if (this.current().type === TokenType.COMMA) {
        this.advance();
        // Allow trailing comma before close brace is an error
        if (this.current().type === TokenType.RBRACE) {
          throw new XCONParseError(
            'Trailing comma not allowed',
            this.current().line,
            this.current().column,
          );
        }
      }
    }

    this.expect(TokenType.RBRACE);

    return {
      type: 'Document',
      fields,
    };
  }

  private parseFieldValue(): FieldValueNode {
    if (this.current().type === TokenType.LBRACE) {
      return this.parseDocument();
    }

    if (this.current().type === TokenType.LBRACKET) {
      return this.parseArray();
    }

    // Empty value case
    if (this.current().type === TokenType.COMMA || this.current().type === TokenType.RBRACE) {
      return {
        type: 'Value',
        raw: '',
      };
    }

    // Must be a value (bare word or quoted string)
    if (
      this.current().type === TokenType.LABEL_OR_VALUE ||
      this.current().type === TokenType.QUOTED_STRING
    ) {
      const token = this.advance();
      return {
        type: 'Value',
        raw: token.value,
      };
    }

    throw new XCONParseError(
      `Unexpected token: ${this.current().type}`,
      this.current().line,
      this.current().column,
    );
  }

  private parseArray(): ArrayNode {
    this.expect(TokenType.LBRACKET);

    const items: FieldValueNode[] = [];

    while (this.current().type !== TokenType.RBRACKET) {
      items.push(this.parseFieldValue());

      if (this.current().type === TokenType.COMMA) {
        this.advance();
        if (this.current().type === TokenType.RBRACKET) {
          throw new XCONParseError(
            'Trailing comma not allowed',
            this.current().line,
            this.current().column,
          );
        }
      }
    }

    this.expect(TokenType.RBRACKET);

    return {
      type: 'Array',
      items,
    };
  }
}

export function parseToAST(input: string, _options?: ParseOptions): XCONDocument {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  return parser.parse();
}

export function parse(input: string, options?: ParseOptions): Record<string, unknown> | unknown[] {
  const ast = parseToAST(input, options);
  return evaluate(ast);
}

function evaluate(
  doc: XCONDocument,
): Record<string, unknown> | unknown[] {
  if (doc.body.rows.length === 0) {
    return doc.header ? {} : [];
  }

  // Check if rows have labels
  const hasLabels = doc.body.rows.some((r) => r.label !== null);
  const allHaveLabels = doc.body.rows.every((r) => r.label !== null);

  if (hasLabels && !allHaveLabels) {
    throw new XCONParseError('Mixed labeled and unlabeled rows', 0, 0);
  }

  if (hasLabels) {
    const result: Record<string, unknown> = {};
    for (const row of doc.body.rows) {
      const value = evaluateDocument(row.document, doc.header?.labels ?? []);
      result[row.label!] = value;
    }
    return result;
  }

  // No labels - return array
  const result: unknown[] = [];
  for (const row of doc.body.rows) {
    const value = evaluateDocument(row.document, doc.header?.labels ?? []);
    result.push(value);
  }
  return result;
}

function evaluateDocument(
  doc: DocumentNode,
  schema: LabelNode[],
): Record<string, unknown> | unknown[] {
  const values: unknown[] = [];

  for (const field of doc.fields) {
    values.push(evaluateFieldValue(field, schema[values.length]?.children ?? []));
  }

  if (schema.length === 0) {
    // No schema: return array
    return values;
  }

  // Apply schema to values positionally
  const result: Record<string, unknown> = {};
  for (let i = 0; i < schema.length; i++) {
    const label = schema[i];
    const value = values[i];

    if (!label) continue;

    if (label.isArray) {
      // This field should be an array
      if (Array.isArray(value)) {
        result[label.name] = value;
      } else if (value === undefined) {
        result[label.name] = [];
      } else {
        result[label.name] = [value];
      }
    } else if (label.children.length > 0) {
      // This field is a nested document
      result[label.name] = value;
    } else {
      result[label.name] = value;
    }
  }

  return result;
}

function evaluateFieldValue(
  field: FieldValueNode,
  schema: LabelNode[],
): unknown {
  if (field.type === 'Value') {
    return inferType(field.raw);
  }

  if (field.type === 'Array') {
    return field.items.map((item) => evaluateFieldValue(item, []));
  }

  if (field.type === 'Document') {
    return evaluateDocument(field, schema);
  }

  return null;
}
