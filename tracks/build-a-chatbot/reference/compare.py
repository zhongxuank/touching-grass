import sys

from rag.chunks import format_hit
from rag.keyword import keyword_search
from rag.search import search
from rag.store import get_index


def show(hits: list) -> None:
    if not hits:
        print("  no matches")
    for hit in hits:
        print("  " + format_hit(hit))


def main(args: list[str], model=None) -> None:
    question = " ".join(args) or "Why does the assistant forget things said long ago?"
    index = get_index(model=model)
    print(f"Question: {question}\n")
    print("Keyword search:")
    show(keyword_search(question, index.chunks))
    print("Embedding search:")
    show(search(question, index, model=model))


if __name__ == "__main__":
    main(sys.argv[1:])
