import sys

from rag.chunks import format_hit
from rag.keyword import keyword_search
from rag.notes import load_chunks


def main(args: list[str]) -> None:
    question = " ".join(args) or "How does the agent loop end?"
    chunks = load_chunks()
    print(f"Loaded {len(chunks)} chunks from notes/")
    hits = keyword_search(question, chunks)
    print(f"Question: {question}")
    if not hits:
        print("  no matching words in any chunk")
    for hit in hits:
        print("  " + format_hit(hit))


if __name__ == "__main__":
    main(sys.argv[1:])
