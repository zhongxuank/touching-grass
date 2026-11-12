import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    source: str
    position: int
    text: str


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    score: float


def split_text(text: str, max_chars: int = 500) -> list[str]:
    pieces = []
    for paragraph in text.split("\n\n"):
        paragraph = " ".join(paragraph.split())
        if not paragraph or paragraph.startswith("#"):
            continue
        current = ""
        for sentence in re.split(r"(?<=[.!?])\s+", paragraph):
            if current and len(current) + 1 + len(sentence) > max_chars:
                pieces.append(current)
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        pieces.append(current)
    return pieces


def format_hit(hit: Hit) -> str:
    return f"{hit.score:.2f}  {hit.chunk.source} #{hit.chunk.position}: {hit.chunk.text[:70]}"
