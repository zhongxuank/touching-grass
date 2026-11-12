from rag.chunks import Chunk, Hit
from rag.index import build_index
from rag.search import search
import re


VOCAB = ["agent", "loop", "tool", "model", "window", "token", "retry", "error"]


class FakeModel:
    """A tiny stand-in for the embedding model: counts how often each VOCAB word appears."""

    def embed(self, texts):
        for text in texts:
            words = re.findall(r"[a-z]+", text.lower())
            yield [float(words.count(word)) for word in VOCAB]

CHUNKS = [
    Chunk("loop.md", 0, "The agent loop calls the model."),
    Chunk("tokens.md", 0, "A token is part of a word in the window."),
    Chunk("retry.md", 0, "Retry after an error."),
]


def test_search_returns_hits_with_the_closest_chunk_first():
    index = build_index(CHUNKS, FakeModel())
    hits = search("what is a token", index, model=FakeModel())
    assert all(isinstance(hit, Hit) for hit in hits)
    assert hits[0].chunk.source == "tokens.md"
    assert [h.score for h in hits] == sorted((h.score for h in hits), reverse=True)


def test_search_respects_top_k():
    index = build_index(CHUNKS, FakeModel())
    assert len(search("agent loop", index, top_k=2, model=FakeModel())) == 2
