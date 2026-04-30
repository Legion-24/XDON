import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Set, Union

from .errors import XCONMacroError


@dataclass
class MacroDefinition:
    body: str
    params: Optional[List[str]]
    source_line: int


MacroContext = Dict[str, MacroDefinition]


@dataclass
class ExpandOptions:
    """Options controlling macro expansion."""
    initial_context: Optional[MacroContext] = None
    strict: bool = True
    max_depth: int = 16
    # Allowlist for %_ENV(VAR). Default: no env access. Pass '*' for all.
    env_allowlist: Optional[Union[List[str], str]] = None


_BUILTIN_NAMES: Set[str] = {
    "_DATE_STR",
    "_TIME_STR",
    "_DATETIME_STR",
    "_TIMESTAMP",
    "_DAY_STR",
    "_UUID",
    "_ENV",
}


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
        self.tokens: List[ExprToken] = []
        self.pos = 0

    def evaluate(self, expr: str, line: int, col: int) -> float:
        self.tokens = self._lex(expr, line, col)
        self.pos = 0
        result = self._parse_add(line, col)
        if self._cur().type != ExprTokenType.EOF:
            raise XCONMacroError(
                f"Unexpected token in expression: '{self._cur().value}'",
                line,
                col,
            )
        return result

    def _lex(self, expr: str, line: int, col: int) -> List[ExprToken]:
        tokens: List[ExprToken] = []
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
            elif ch.isdigit() or (
                ch == "." and i + 1 < len(expr) and expr[i + 1].isdigit()
            ):
                num_str = ""
                dot_seen = False
                while i < len(expr) and (
                    expr[i].isdigit() or (expr[i] == "." and not dot_seen)
                ):
                    if expr[i] == ".":
                        dot_seen = True
                    num_str += expr[i]
                    i += 1
                tokens.append(ExprToken(ExprTokenType.NUMBER, num_str))
            else:
                raise XCONMacroError(f"Unexpected character in expression: '{ch}'", line, col)
        tokens.append(ExprToken(ExprTokenType.EOF, ""))
        return tokens

    def _cur(self) -> ExprToken:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return ExprToken(ExprTokenType.EOF, "")

    def _adv(self) -> ExprToken:
        t = self._cur()
        self.pos += 1
        return t

    def _expect(self, t: ExprTokenType, line: int, col: int) -> ExprToken:
        cur = self._cur()
        if cur.type != t:
            raise XCONMacroError(f"Expected {t} but got {cur.type}", line, col)
        return self._adv()

    def _parse_add(self, line: int, col: int) -> float:
        left = self._parse_mul(line, col)
        while self._cur().type in (ExprTokenType.PLUS, ExprTokenType.MINUS):
            op = self._adv()
            right = self._parse_mul(line, col)
            left = left + right if op.type == ExprTokenType.PLUS else left - right
        return left

    def _parse_mul(self, line: int, col: int) -> float:
        left = self._parse_unary(line, col)
        while self._cur().type in (ExprTokenType.STAR, ExprTokenType.SLASH, ExprTokenType.PERCENT):
            op = self._adv()
            right = self._parse_unary(line, col)
            if op.type == ExprTokenType.STAR:
                left = left * right
            elif op.type == ExprTokenType.SLASH:
                if right == 0:
                    raise XCONMacroError("Division by zero in expression", line, col)
                left = left / right
            else:
                if right == 0:
                    raise XCONMacroError("Modulo by zero in expression", line, col)
                left = left % right
        return left

    def _parse_unary(self, line: int, col: int) -> float:
        if self._cur().type == ExprTokenType.MINUS:
            self._adv()
            return -self._parse_unary(line, col)
        return self._parse_primary(line, col)

    def _parse_primary(self, line: int, col: int) -> float:
        if self._cur().type == ExprTokenType.NUMBER:
            return float(self._adv().value)
        if self._cur().type == ExprTokenType.LPAREN:
            self._adv()
            v = self._parse_add(line, col)
            self._expect(ExprTokenType.RPAREN, line, col)
            return v
        raise XCONMacroError(
            f"Expected number or '(' in expression, got {self._cur().type}",
            line,
            col,
        )


@dataclass
class _ExpandState:
    context: MacroContext
    strict: bool
    max_depth: int
    env_allowlist: Union[Set[str], str]


def expand(input_text: str, options: Optional[ExpandOptions] = None) -> str:
    """Expand macros in `input_text` to plain text. Run before `parse(...)`."""
    if options is None:
        options = ExpandOptions()

    context: MacroContext = dict(options.initial_context or {})

    if options.env_allowlist == "*":
        env_allowlist: Union[Set[str], str] = "all"
    elif options.env_allowlist is None:
        env_allowlist = set()
    else:
        env_allowlist = set(options.env_allowlist)

    state = _ExpandState(
        context=context,
        strict=options.strict,
        max_depth=options.max_depth,
        env_allowlist=env_allowlist,
    )

    lines = input_text.split("\n")
    output_lines: List[str] = []
    trailing_newline = input_text.endswith("\n")

    def_re = re.compile(
        r'^\s*%([a-zA-Z_][a-zA-Z0-9_]*)(?:\(([^)]*)\))?\s*=\s*"((?:[^"\\]|\\.)*)"\s*$'
    )

    for line_num in range(1, len(lines) + 1):
        line = lines[line_num - 1] if line_num <= len(lines) else ""
        m = def_re.fullmatch(line)
        if m:
            name = m.group(1)
            param_str = m.group(2) or ""
            raw_body = m.group(3) or ""
            params: Optional[List[str]] = None
            if param_str.strip():
                params = [p.strip() for p in param_str.split(",") if p.strip()]
            body = _decode_escapes(raw_body)
            context[name] = MacroDefinition(
                body=body,
                params=params,
                source_line=line_num,
            )
        else:
            output_lines.append(_expand_line(line, state, line_num, 0))

    result = "\n".join(output_lines)
    if trailing_newline:
        result += "\n"
    return result


def _decode_escapes(s: str) -> str:
    out: List[str] = []
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and i + 1 < len(s):
            nxt = s[i + 1]
            if nxt == '"':
                out.append('"')
            elif nxt == "\\":
                out.append("\\")
            elif nxt == "n":
                out.append("\n")
            elif nxt == "t":
                out.append("\t")
            else:
                out.append(nxt)
            i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def _expand_builtin(
    name: str,
    args: Optional[List[str]],
    env_allowlist: Union[Set[str], str],
) -> str:
    now = datetime.now(timezone.utc)
    if name == "_DATE_STR":
        return now.strftime("%Y-%m-%d")
    if name == "_TIME_STR":
        return now.strftime("%H:%M:%S")
    if name == "_DATETIME_STR":
        # ISO 8601 with Z suffix
        return now.strftime("%Y-%m-%dT%H:%M:%SZ")
    if name == "_TIMESTAMP":
        return str(int(now.timestamp()))
    if name == "_DAY_STR":
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        return days[now.weekday()]
    if name == "_UUID":
        return str(uuid.uuid4())
    if name == "_ENV":
        var_name = args[0] if args else ""
        if not var_name:
            return ""
        if env_allowlist != "all" and (
            not isinstance(env_allowlist, set) or var_name not in env_allowlist
        ):
            return ""
        return os.environ.get(var_name, "")
    return ""


def _find_matching_paren(s: str, open_idx: int) -> int:
    depth = 0
    k = open_idx
    while k < len(s):
        ch = s[k]
        if ch == "\\" and k + 1 < len(s):
            k += 2
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return k
        k += 1
    return -1


def _split_args(s: str) -> List[str]:
    parts: List[str] = []
    depth = 0
    cur: List[str] = []
    k = 0
    while k < len(s):
        ch = s[k]
        if ch == "\\" and k + 1 < len(s):
            cur.append(ch)
            cur.append(s[k + 1])
            k += 2
            continue
        if ch in "({[":
            depth += 1
        elif ch in ")}]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur).strip())
            cur = []
            k += 1
            continue
        cur.append(ch)
        k += 1
    parts.append("".join(cur).strip())
    if len(parts) == 1 and parts[0] == "":
        return []
    return parts


def _substitute_params(body: str, params: List[str], args: List[str]) -> str:
    if not params:
        return body
    table = {p: args[i] if i < len(args) else "" for i, p in enumerate(params)}
    sorted_names = sorted(table.keys(), key=len, reverse=True)
    pattern = re.compile(
        r"\{(" + "|".join(re.escape(n) for n in sorted_names) + r")\}"
    )
    return pattern.sub(lambda m: table[m.group(1)], body)


def _expand_line(
    line: str,
    state: _ExpandState,
    line_num: int,
    depth: int,
) -> str:
    if depth > state.max_depth:
        raise XCONMacroError("Macro expansion depth exceeded", line_num, 1)

    result: List[str] = []
    i = 0
    name_re = re.compile(r"^([a-zA-Z_][a-zA-Z0-9_]*)")

    while i < len(line):
        if line[i] == "%":
            if i + 1 < len(line) and line[i + 1] == "{":
                close_idx = line.find("}", i + 2)
                if close_idx == -1:
                    raise XCONMacroError(
                        "Unclosed expression macro %{...}", line_num, i + 1
                    )
                expr_str = line[i + 2 : close_idx]
                expr_str = _expand_line(expr_str, state, line_num, depth + 1)
                ev = ExprEvaluator()
                expr_result = ev.evaluate(expr_str, line_num, i + 1)
                if expr_result == int(expr_result):
                    result.append(str(int(expr_result)))
                else:
                    result.append(str(expr_result))
                i = close_idx + 1
                continue

            m = name_re.match(line[i + 1 :])
            if not m:
                result.append("%")
                i += 1
                continue

            name = m.group(1)
            next_idx = i + 1 + len(name)
            args: Optional[List[str]] = None

            if next_idx < len(line) and line[next_idx] == "(":
                close_paren_idx = _find_matching_paren(line, next_idx)
                if close_paren_idx == -1:
                    raise XCONMacroError(
                        f"Unclosed parameter list for macro '{name}'",
                        line_num,
                        next_idx + 1,
                        name,
                    )
                arg_str = line[next_idx + 1 : close_paren_idx]
                args = _split_args(arg_str) if arg_str else []
                args = [_expand_line(a, state, line_num, depth + 1) for a in args]
                next_idx = close_paren_idx + 1

            user_def = state.context.get(name)

            if user_def is not None:
                if user_def.params is None and args is not None and len(args) > 0:
                    raise XCONMacroError(
                        f"Macro '{name}' takes no parameters, but {len(args)} provided",
                        line_num,
                        i + 1,
                        name,
                    )
                if user_def.params is not None and (
                    args is None or len(args) != len(user_def.params)
                ):
                    expected = len(user_def.params)
                    got = len(args) if args else 0
                    raise XCONMacroError(
                        f"Macro '{name}' expects {expected} arguments, got {got}",
                        line_num,
                        i + 1,
                        name,
                    )
                body = user_def.body
                if user_def.params and args:
                    body = _substitute_params(body, user_def.params, args)
                result.append(_expand_line(body, state, line_num, depth + 1))
                i = next_idx
                continue

            if name in _BUILTIN_NAMES:
                result.append(_expand_builtin(name, args, state.env_allowlist))
                i = next_idx
                continue

            if state.strict:
                raise XCONMacroError(
                    f"Undefined macro '{name}'", line_num, i + 1, name
                )
            result.append(
                f"%{name}" + (f"({','.join(args)})" if args else "")
            )
            i = next_idx
        else:
            result.append(line[i])
            i += 1

    return "".join(result)
