import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

from .errors import LMONMacroError


@dataclass
class MacroDefinition:
    body: str
    params: Optional[list[str]]
    source_line: int


MacroContext = dict[str, MacroDefinition]


@dataclass
class ExpandOptions:
    initial_context: Optional[MacroContext] = None
    strict: bool = True
    max_depth: int = 16


class ExprTokenType(Enum):
    NUMBER = "NUMBER"
    PLUS = "PLUS"
    MINUS = "MINUS"
    STAR = "STAR"
    SLASH = "SLASH"
    PERCENT = "PERCENT"
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    EOF = "EOF"


@dataclass
class ExprToken:
    type: ExprTokenType
    value: str


class ExprEvaluator:
    def __init__(self) -> None:
        self.tokens: list[ExprToken] = []
        self.pos = 0

    def evaluate(self, expr: str, line: int, col: int) -> float:
        self.tokens = self.lex_expr(expr, line, col)
        self.pos = 0
        result = self.parse_add_expr(line, col)
        if self.current().type != ExprTokenType.EOF:
            raise LMONMacroError(
                f"Unexpected token in expression: '{self.current().value}'",
                line,
                col,
            )
        return result

    def lex_expr(self, expr: str, line: int, col: int) -> list[ExprToken]:
        tokens: list[ExprToken] = []
        i = 0

        while i < len(expr):
            ch = expr[i]

            if ch.isspace():
                i += 1
                continue

            if ch == "+":
                tokens.append(ExprToken(ExprTokenType.PLUS, "+"))
                i += 1
            elif ch == "-":
                tokens.append(ExprToken(ExprTokenType.MINUS, "-"))
                i += 1
            elif ch == "*":
                tokens.append(ExprToken(ExprTokenType.STAR, "*"))
                i += 1
            elif ch == "/":
                tokens.append(ExprToken(ExprTokenType.SLASH, "/"))
                i += 1
            elif ch == "%":
                tokens.append(ExprToken(ExprTokenType.PERCENT, "%"))
                i += 1
            elif ch == "(":
                tokens.append(ExprToken(ExprTokenType.LPAREN, "("))
                i += 1
            elif ch == ")":
                tokens.append(ExprToken(ExprTokenType.RPAREN, ")"))
                i += 1
            elif ch.isdigit() or (ch == "." and i + 1 < len(expr) and expr[i + 1].isdigit()):
                num_str = ""
                while i < len(expr) and (expr[i].isdigit() or expr[i] == "."):
                    num_str += expr[i]
                    i += 1
                tokens.append(ExprToken(ExprTokenType.NUMBER, num_str))
            else:
                raise LMONMacroError(f"Unexpected character in expression: '{ch}'", line, col)

        tokens.append(ExprToken(ExprTokenType.EOF, ""))
        return tokens

    def current(self) -> ExprToken:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return ExprToken(ExprTokenType.EOF, "")

    def advance(self) -> ExprToken:
        token = self.current()
        self.pos += 1
        return token

    def expect(self, token_type: ExprTokenType, line: int, col: int) -> ExprToken:
        token = self.current()
        if token.type != token_type:
            raise LMONMacroError(f"Expected {token_type} but got {token.type}", line, col)
        return self.advance()

    def parse_add_expr(self, line: int, col: int) -> float:
        left = self.parse_mul_expr(line, col)

        while self.current().type in (ExprTokenType.PLUS, ExprTokenType.MINUS):
            op = self.advance()
            right = self.parse_mul_expr(line, col)
            left = left + right if op.type == ExprTokenType.PLUS else left - right

        return left

    def parse_mul_expr(self, line: int, col: int) -> float:
        left = self.parse_unary(line, col)

        while self.current().type in (ExprTokenType.STAR, ExprTokenType.SLASH, ExprTokenType.PERCENT):
            op = self.advance()
            right = self.parse_unary(line, col)

            if op.type == ExprTokenType.STAR:
                left = left * right
            elif op.type == ExprTokenType.SLASH:
                if right == 0:
                    raise LMONMacroError("Division by zero in expression", line, col)
                left = left / right
            else:
                if right == 0:
                    raise LMONMacroError("Modulo by zero in expression", line, col)
                left = left % right

        return left

    def parse_unary(self, line: int, col: int) -> float:
        if self.current().type == ExprTokenType.MINUS:
            self.advance()
            return -self.parse_unary(line, col)
        return self.parse_primary(line, col)

    def parse_primary(self, line: int, col: int) -> float:
        if self.current().type == ExprTokenType.NUMBER:
            return float(self.advance().value)

        if self.current().type == ExprTokenType.LPAREN:
            self.advance()
            val = self.parse_add_expr(line, col)
            self.expect(ExprTokenType.RPAREN, line, col)
            return val

        raise LMONMacroError(
            f"Expected number or '(' in expression, got {self.current().type}",
            line,
            col,
        )


def expand(input_text: str, options: Optional[ExpandOptions] = None) -> str:
    if options is None:
        options = ExpandOptions()

    spec_macros = build_spec_macros()
    context: MacroContext = {**spec_macros, **(options.initial_context or {})}
    strict = options.strict
    max_depth = options.max_depth

    lines = input_text.split("\n")
    output_lines: list[str] = []
    trailing_newline = input_text.endswith("\n")

    for line_num in range(1, len(lines) + 1):
        line = lines[line_num - 1] if line_num <= len(lines) else ""
        import re

        def_match = re.fullmatch(
            r'^\s*%([a-zA-Z_][a-zA-Z0-9_]*)(?:\(([^)]*)\))?\s*=\s*"((?:[^"\\]|\\.)*)"[\t ]*$',
            line,
        )

        if def_match:
            name = def_match.group(1)
            param_str = def_match.group(2) or ""
            raw_body = def_match.group(3) or ""

            params: Optional[list[str]] = None
            if param_str.strip():
                params = [p.strip() for p in param_str.split(",") if p.strip()]

            body = decode_escapes(raw_body)

            context[name] = MacroDefinition(
                body=body,
                params=params,
                source_line=line_num,
            )
        else:
            expanded = expand_line(line, context, strict, max_depth, line_num, 0)
            output_lines.append(expanded)

    result = "\n".join(output_lines)
    if trailing_newline:
        result += "\n"
    return result


def decode_escapes(s: str) -> str:
    return (
        s.replace('\\"', '"')
        .replace("\\\\", "\\")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
    )


def build_spec_macros() -> MacroContext:
    now = datetime.now()

    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    datetime_str = now.isoformat() + "Z"

    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_str = days[now.weekday()]

    timestamp = str(int(now.timestamp()))
    uuid_str = str(uuid.uuid4())

    return {
        "_DATE_STR": MacroDefinition(body=date_str, params=None, source_line=0),
        "_TIMESTAMP": MacroDefinition(body=timestamp, params=None, source_line=0),
        "_DATETIME_STR": MacroDefinition(body=datetime_str, params=None, source_line=0),
        "_DAY_STR": MacroDefinition(body=day_str, params=None, source_line=0),
        "_TIME_STR": MacroDefinition(body=time_str, params=None, source_line=0),
        "_UUID": MacroDefinition(body=uuid_str, params=None, source_line=0),
        "_ENV": MacroDefinition(body="", params=["VAR"], source_line=0),
    }


def expand_line(
    line: str,
    context: MacroContext,
    strict: bool,
    max_depth: int,
    line_num: int,
    depth: int,
) -> str:
    if depth > max_depth:
        raise LMONMacroError("Macro expansion depth exceeded", line_num, 1)

    result = ""
    i = 0

    while i < len(line):
        if line[i] == "%":
            if i + 1 < len(line) and line[i + 1] == "{":
                close_idx = line.find("}", i + 2)
                if close_idx == -1:
                    raise LMONMacroError(
                        "Unclosed expression macro %{...}",
                        line_num,
                        i + 1,
                    )

                expr_str = line[i + 2 : close_idx]
                expr_str = expand_line(expr_str, context, strict, max_depth, line_num, depth + 1)

                evaluator = ExprEvaluator()
                expr_result = evaluator.evaluate(expr_str, line_num, i + 1)
                stringified = str(int(expr_result)) if expr_result == int(expr_result) else str(expr_result)

                result += stringified
                i = close_idx + 1
            else:
                import re

                name_match = re.match(r"^([a-zA-Z_][a-zA-Z0-9_]*)", line[i + 1 :])
                if not name_match:
                    result += "%"
                    i += 1
                    continue

                name = name_match.group(1)
                next_idx = i + 1 + len(name)
                args: Optional[list[str]] = None

                if next_idx < len(line) and line[next_idx] == "(":
                    close_paren_idx = line.find(")", next_idx)
                    if close_paren_idx == -1:
                        raise LMONMacroError(
                            f"Unclosed parameter list for macro '{name}'",
                            line_num,
                            next_idx + 1,
                        )

                    arg_str = line[next_idx + 1 : close_paren_idx]
                    args = [a.strip() for a in arg_str.split(",")] if arg_str.strip() else []
                    next_idx = close_paren_idx + 1

                def_macro = context.get(name)

                if not def_macro:
                    if strict:
                        raise LMONMacroError(
                            f"Undefined macro '{name}'",
                            line_num,
                            i + 1,
                            name,
                        )
                    result += f"%{name}" + (f"({','.join(args)})" if args else "")
                    i = next_idx
                    continue

                if def_macro.params is None and args and len(args) > 0:
                    raise LMONMacroError(
                        f"Macro '{name}' takes no parameters, but {len(args)} provided",
                        line_num,
                        i + 1,
                        name,
                    )

                if def_macro.params is not None and (
                    not args or len(args) != len(def_macro.params)
                ):
                    expected = len(def_macro.params)
                    got = len(args) if args else 0
                    raise LMONMacroError(
                        f"Macro '{name}' expects {expected} arguments, got {got}",
                        line_num,
                        i + 1,
                        name,
                    )

                if name == "_ENV" and args and len(args) > 0:
                    env_var_name = args[0]
                    env_value = os.environ.get(env_var_name, "")
                    substituted = env_value
                else:
                    body = def_macro.body

                    if def_macro.params and args:
                        for j, param in enumerate(def_macro.params):
                            placeholder = f"{{{param}}}"
                            body = body.replace(placeholder, args[j])

                    substituted = expand_line(body, context, strict, max_depth, line_num, depth + 1)

                result += substituted
                i = next_idx
        else:
            result += line[i]
            i += 1

    return result
