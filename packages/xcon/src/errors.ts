export class XCONParseError extends Error {
  public readonly line: number;

  public readonly column: number;

  public readonly source: string | undefined;

  constructor(
    message: string,
    line: number,
    column: number,
    source?: string,
  ) {
    super(`[XCON ParseError at ${line}:${column}] ${message}`);
    this.line = line;
    this.column = column;
    this.source = source;
    this.name = 'XCONParseError';
    Object.setPrototypeOf(this, XCONParseError.prototype);
  }
}

export class XCONStringifyError extends Error {
  constructor(message: string) {
    super(`[XCON StringifyError] ${message}`);
    this.name = 'XCONStringifyError';
    Object.setPrototypeOf(this, XCONStringifyError.prototype);
  }
}

export class XCONMacroError extends Error {
  public readonly line: number;

  public readonly column: number;

  public readonly macroName: string | undefined;

  constructor(
    message: string,
    line: number,
    column: number,
    macroName?: string,
  ) {
    super(`[XCON MacroError at ${line}:${column}] ${message}`);
    this.line = line;
    this.column = column;
    this.macroName = macroName;
    this.name = 'XCONMacroError';
    Object.setPrototypeOf(this, XCONMacroError.prototype);
  }
}
