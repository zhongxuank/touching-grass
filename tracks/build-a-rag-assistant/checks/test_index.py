from rag.chunks import Chunk
from rag.index import build_index
import re


VOCAB = ["agent", "loop", "tool", "model", "window", "token", "retry", "error"]


class FakeModel:
    """A tiny stand-in for the embedding model: counts how often each VOCAB word appears."""

    def embed(self, texts):
        for text in texts:
            words = re.findall(r"[a-z]+", text.lower())
            yield [float(words.count(word)) for word in VOCAB]


def test_build_index_has_one_vector_per_chunk_in_the_same_order():
    chunks = [Chunk("a.md", 0, "agent loop"), Chunk("b.md", 0, "token window"), Chunk("c.md", 0, "retry error")]
    index = build_index(chunks, FakeModel())
    assert index.chunks == chunks
    assert index.vectors.shape == (3, len(VOCAB))
    assert index.vectors[0][VOCAB.index("agent")] > 0
    assert index.vectors[1][VOCAB.index("window")] > 0
