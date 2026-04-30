export { parse, parseToAST } from './parser.js';
export { stringify } from './stringifier.js';
export { toJSON, fromJSON } from './json.js';
export { expand } from './macro.js';
export { inferType } from './evaluator.js';
export { tokenize, TokenType } from './tokenizer.js';
export { XCONParseError, XCONStringifyError, XCONMacroError } from './errors.js';
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
} from './ast.js';
export type { Token } from './tokenizer.js';
export type { MacroContext, MacroDefinition, ExpandOptions } from './macro.js';

export const VERSION = '1.0.0-beta.1';
