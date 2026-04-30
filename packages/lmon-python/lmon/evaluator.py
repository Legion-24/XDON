from typing import Union


def infer_type(raw: str) -> Union[str, int, float, bool, None]:
    """Infer the type of a raw value string."""
    if raw == 'null':
        return None

    if raw == 'true':
        return True

    if raw == 'false':
        return False

    if raw.lstrip('-').isdigit():
        return int(raw)

    try:
        if '.' in raw:
            num = float(raw)
            # Handle -0
            return 0 if num == 0 else num
    except ValueError:
        pass

    return raw
