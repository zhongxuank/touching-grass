from contextlib import contextmanager

from agent.tools import TOOLS


@contextmanager
def record_tool_calls():
    calls: list[dict] = []
    originals = dict(TOOLS)

    def recording(name, func):
        def wrapper(**args):
            call = {"name": name, "args": args, "result": "", "error": False}
            calls.append(call)
            try:
                value = func(**args)
            except Exception as exc:
                call["result"] = f"Error: {exc}"
                call["error"] = True
                raise
            call["result"] = str(value)
            return value

        return wrapper

    for name, func in originals.items():
        TOOLS[name] = recording(name, func)
    try:
        yield calls
    finally:
        TOOLS.clear()
        TOOLS.update(originals)
