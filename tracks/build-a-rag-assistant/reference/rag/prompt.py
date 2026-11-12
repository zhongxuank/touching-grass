from rag.chunks import Hit

SYSTEM = (
    "You answer questions using only the sources you are given. "
    "Each source is labelled with its file name in square brackets. "
    "After each claim, cite the file name in square brackets, like [agent-loop.md]. "
    "If the sources do not contain the answer, say you don't know."
)


def build_prompt(question: str, hits: list[Hit]) -> str:
    sources = "\n\n".join(f"[{hit.chunk.source}]\n{hit.chunk.text}" for hit in hits)
    return f"Sources:\n\n{sources}\n\nQuestion: {question}"
