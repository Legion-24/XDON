export class LMONParseError extends Error {
  public readonly line: number;

  public readonly column: number;

  public readonly source: string | undefined;

  constructor(
    message: string,
    line: number,
    column: number,
    source?: string,
  ) {
    super(`[LMON ParseError at ${line}:${column}] ${message}`);
    this.line = line;
    this.column = column;
    this.source = source;
    this.name = 'LMONParseError';
    Object.setPrototypeOf(this, LMONParseError.prototype);
  }
}

export class LMONStringifyError extends Error {
  constructor(message: string) {
    super(`[LMON StringifyError] ${message}`);
    this.name = 'LMONStringifyError';
    Object.setPrototypeOf(this, LMONStringifyError.prototype);
  }
}
