from typing import Optional


class LMONParseError(Exception):
    """Error during LMON parsing."""

    def __init__(
        self,
        message: str,
        line: int,
        column: int,
        source: Optional[str] = None,
    ) -> None:
        self.message = message
        self.line = line
        self.column = column
        self.source = source
        super().__init__(f"[LMON ParseError at {line}:{column}] {message}")


class LMONStringifyError(Exception):
    """Error during LMON stringification."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(f"[LMON StringifyError] {message}")
