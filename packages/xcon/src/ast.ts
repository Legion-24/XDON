/**
 * Abstract Syntax Tree (AST) node types for XCON documents.
 * These types represent the parsed structure of XCON text,
 * independent of final type inference or evaluation.
 */

export interface XCONDocument {
  type: 'XCONDocument';
  header: HeaderNode | null;
  body: BodyNode;
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
}

export interface ArrayNode {
  type: 'Array';
  items: FieldValueNode[];
}

export interface ParseOptions {
  strict?: boolean;
}

export interface StringifyOptions {
  rowLabels?: boolean;
  indent?: boolean;
}
