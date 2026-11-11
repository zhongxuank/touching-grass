from datetime import datetime, timezone


def get_time() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def add(a: float, b: float) -> float:
    return a + b


TOOLS = {"get_time": get_time, "add": add}


def run_tool(name: str, args: dict) -> str:
    func = TOOLS.get(name)
    if func is None:
        return f"Error: unknown tool {name}"
    try:
        return str(func(**args))
    except Exception as exc:
        return f"Error: {exc}"
