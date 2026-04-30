/**
 * Abstract Syntax Tree (AST) node types for XCON documents.
 */

export interface XCONDocument {
  type: 'XCONDocument';
  header: HeaderNode | null;
  body: BodyNode;
  versionDirective: string | null;
}

export interface HeaderNode {
  type: 'Header';
  labels: LabelNode[];
}

export interface LabelNode {
  type: 'Label';
  name: string;
  isArray: boolean;
  children: LabelNode[];
}

export interface BodyNode {
  type: 'Body';
  rows: RowNode[];
}

export interface RowNode {
  type: 'Row';
  label: string | null;
  labelLine: number;
  labelColumn: number;
  document: DocumentNode;
}

export interface DocumentNode {
  type: 'Document';
  fields: FieldValueNode[];
}

export type FieldValueNode = ValueNode | DocumentNode | ArrayNode;

export interface ValueNode {
  type: 'Value';
  raw: string;
  quoted: boolean;
}

export interface ArrayNode {
  type: 'Array';
  items: FieldValueNode[];
}

export interface ParseOptions {
  /** Maximum nesting depth of {} and [] combined. Default 64. */
  maxDepth?: number;
  /** Maximum input length in UTF-8 bytes (or chars; .length is used for speed). Default 16 MiB. */
  maxLength?: number;
  /** Maximum number of body rows. Default 1,000,000. */
  maxRows?: number;
}

export interface StringifyOptions {
  /**
   * Whether to emit row labels for object inputs.
   * Default true. If false, an object input is treated as a single row (its values).
   */
  rowLabels?: boolean;
}

export const DEFAULT_MAX_DEPTH = 64;
export const DEFAULT_MAX_LENGTH = 16 * 1024 * 1024;
export const DEFAULT_MAX_ROWS = 1_000_000;
