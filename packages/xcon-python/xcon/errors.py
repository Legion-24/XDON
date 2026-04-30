from typing import Optional


class XCONParseError(Exception):
    """Error during XCON parsing."""

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
        super().__init__(f"[XCON ParseError at {line}:{column}] {message}")


class XCONStringifyError(Exception):
    """Error during XCON stringification."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(f"[XCON StringifyError] {message}")


class XCONMacroError(Exception):
    """Error during macro expansion."""

    def __init__(
        self,
        message: str,
        line: int,
        column: int,
        macro_name: Optional[str] = None,
    ) -> None:
        self.message = message
        self.line = line
        self.column = column
        self.macro_name = macro_name
        super().__init__(f"[XCON MacroError at {line}:{column}] {message}")
