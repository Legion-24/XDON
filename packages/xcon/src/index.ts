export { parse, parseToAST } from './parser';
export { stringify } from './stringifier';
export { toJSON, fromJSON } from './json';
export { expand } from './macro';
export { inferType } from './evaluator';
export { tokenize, TokenType } from './tokenizer';
export { XCONParseError, XCONStringifyError, XCONMacroError } from './errors';
export type {
  XCONDocument,
  HeaderNode,
  LabelNode,
  BodyNode,
  RowNode,
  DocumentNode,
  ArrayNode,
  ValueNode,
  FieldValueNode,
  ParseOptions,
  StringifyOptions,
} from './ast';
export type { Token } from './tokenizer';
export type { MacroContext, MacroDefinition, ExpandOptions } from './macro';

export const VERSION = '1.0.0';
