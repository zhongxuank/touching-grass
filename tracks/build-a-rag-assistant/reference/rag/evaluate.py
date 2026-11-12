from rag.keyword import keyword_search
from rag.search import search
from rag.store import get_index

EVAL_CASES = [
    ("What ends the agent loop?", "agent-loop.md"),
    ("Why does a loop need a step limit?", "agent-loop.md"),
    ("How does the model decide which tool fits?", "tool-calling.md"),
    ("Does the model run the tools itself?", "tool-calling.md"),
    ("What is a token?", "context-window.md"),
    ("Why does the assistant forget things said long ago?", "context-window.md"),
]


def hit_rate(find, cases: list[tuple[str, str]] = EVAL_CASES) -> float:
    found = 0
    for question, expected in cases:
        sources = [hit.chunk.source for hit in find(question)]
        if expected in sources:
            found += 1
    return found / len(cases)


def main() -> None:
    index = get_index()
    keyword = hit_rate(lambda q: keyword_search(q, index.chunks, top_k=2))
    embedding = hit_rate(lambda q: search(q, index, top_k=2))
    print(f"Questions: {len(EVAL_CASES)}")
    print(f"Keyword search hit rate:   {keyword:.0%}")
    print(f"Embedding search hit rate: {embedding:.0%}")


if __name__ == "__main__":
    main()
