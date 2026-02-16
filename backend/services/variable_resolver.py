import re


def resolve_variables(goal: str, variables: list[dict]) -> str:
    """Replace {{varName}} placeholders in goal with variable values.

    Handles both {{varName}} and {{ varName }} (with spaces).
    """
    if not variables:
        return goal

    resolved = goal
    for var in variables:
        name = re.escape(var["name"])
        pattern = r"\{\{\s*" + name + r"\s*\}\}"
        resolved = re.sub(pattern, var["value"], resolved)

    return resolved
