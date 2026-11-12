import re

from rag.chunks import Chunk, Hit

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from",
    "how", "i", "in", "is", "it", "of", "on", "or", "the", "to", "what", "when", "which",
    "who", "why", "with", "you",
}


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS}


def keyword_search(question: str, chunks: list[Chunk], top_k: int = 3) -> list[Hit]:
    wanted = words(question)
    hits = []
    for chunk in chunks:
        score = len(wanted & words(chunk.text)) / len(wanted) if wanted else 0.0
        hits.append(Hit(chunk, score))
    hits.sort(key=lambda hit: hit.score, reverse=True)
    return [hit for hit in hits[:top_k] if hit.score > 0]
