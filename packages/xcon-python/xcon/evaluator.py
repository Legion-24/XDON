import re
from typing import Union

_INT_RE = re.compile(r"^-?\d+$")
_FLOAT_RE = re.compile(r"^-?\d+\.\d+$")


def infer_type(raw: str) -> Union[str, int, float, bool, None]:
    """Infer the type of a raw, *bare* (unquoted) value string.

    Quoted strings must NOT pass through this function — they are always strings.
    """
    if raw == "null":
        return None
    if raw == "true":
        return True
    if raw == "false":
        return False
    if _INT_RE.fullmatch(raw):
        n = int(raw)
        # Normalize -0 to 0
        return 0 if n == 0 else n
    if _FLOAT_RE.fullmatch(raw):
        n_f = float(raw)
        return 0.0 if n_f == 0 else n_f
    return raw
