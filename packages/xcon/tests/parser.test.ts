import { parseToAST } from '../src/parser';
import { XCONParseError } from '../src/errors';

describe('Parser', () => {
  it('should parse simple document with header and row', () => {
    const ast = parseToAST('(name,age)\nalice:{Alice,30}');
    expect(ast.header).toBeDefined();
    expect(ast.header?.labels.length).toBe(2);
    expect(ast.body.rows.length).toBe(1);
  });

  it('should parse header with array marker', () => {
    const ast = parseToAST('(name,tags[])\nalice:{Alice,[admin]}');
    const tagsLabel = ast.header?.labels.find((l) => l.name === 'tags');
    expect(tagsLabel?.isArray).toBe(true);
  });

  it('should parse nested header schema', () => {
    const ast = parseToAST('(name,address:(city,zip))\nalice:{Alice,{NYC,10001}}');
    const addressLabel = ast.header?.labels.find((l) => l.name === 'address');
    expect(addressLabel?.children.length).toBe(2);
  });

  it('should parse multiple rows', () => {
    const ast = parseToAST('(name)\nalice:{Alice}\nbob:{Bob}');
    expect(ast.body.rows.length).toBe(2);
  });

  it('should parse headerless document', () => {
    const ast = parseToAST('{Alice,30}');
    expect(ast.header).toBeNull();
  });

  it('should parse row labels', () => {
    const ast = parseToAST('(name)\nalice:{Alice}');
    expect(ast.body.rows[0]?.label).toBe('alice');
  });

  it('should parse rows without labels', () => {
    const ast = parseToAST('(name)\n{Alice}');
    expect(ast.body.rows[0]?.label).toBeNull();
  });

  it('should parse nested documents', () => {
    const ast = parseToAST('(name,address:(city))\nalice:{Alice,{NYC}}');
    const firstRow = ast.body.rows[0];
    expect(firstRow?.document.fields.length).toBe(2);
  });

  it('should parse arrays in documents', () => {
    const ast = parseToAST('(tags[])\nuser:{[admin,user]}');
    const firstRow = ast.body.rows[0];
    const arrayField = firstRow?.document.fields[0];
    expect(arrayField?.type).toBe('Array');
  });

  it('should parse empty document', () => {
    const ast = parseToAST('{}');
    expect(ast.body.rows[0]?.document.fields.length).toBe(0);
  });

  it('should parse empty arrays', () => {
    const ast = parseToAST('(items[])\nrow:[]');
    const arrayField = ast.body.rows[0]?.document.fields[0];
    expect(arrayField?.type).toBe('Array');
  });

  it('should throw on unclosed brace', () => {
    expect(() => parseToAST('{hello')).toThrow(XCONParseError);
  });

  it('should throw on missing colon in row label', () => {
    expect(() => parseToAST('user {hello}')).toThrow(XCONParseError);
  });

  it('should throw on unclosed bracket', () => {
    expect(() => parseToAST('[hello')).toThrow(XCONParseError);
  });

  it('should parse whitespace around values correctly', () => {
    const ast = parseToAST('{ hello , world }');
    expect(ast.body.rows[0]).toBeDefined();
  });

  it('should handle quoted values in documents', () => {
    const ast = parseToAST('{ "hello world" , value }');
    expect(ast.body.rows[0]).toBeDefined();
  });
});
