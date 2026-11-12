from datetime import datetime, timezone

from rag.answer import MIN_SCORE
from rag.search import search
from rag.store import get_index


def get_time() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def add(a: float, b: float) -> float:
    return a + b


def search_notes(query: str) -> str:
    hits = [hit for hit in search(query, get_index()) if hit.score >= MIN_SCORE]
    if not hits:
        return "No relevant notes found."
    return "\n\n".join(f"[{hit.chunk.source}] {hit.chunk.text}" for hit in hits)


TOOLS = {"get_time": get_time, "add": add, "search_notes": search_notes}


def run_tool(name: str, args: dict) -> str:
    func = TOOLS.get(name)
    if func is None:
        return f"Error: unknown tool {name}"
    try:
        return str(func(**args))
    except Exception as exc:
        return f"Error: {exc}"
