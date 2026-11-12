import os

import numpy as np
import pytest

from rag.embedder import embed
import re


VOCAB = ["agent", "loop", "tool", "model", "window", "token", "retry", "error"]


class FakeModel:
    """A tiny stand-in for the embedding model: counts how often each VOCAB word appears."""

    def embed(self, texts):
        for text in texts:
            words = re.findall(r"[a-z]+", text.lower())
            yield [float(words.count(word)) for word in VOCAB]


def test_embed_gives_one_unit_length_row_per_text():
    vectors = embed(["agent loop", "token window", "retry error"], FakeModel())
    assert vectors.shape == (3, len(VOCAB))
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1.0)


def test_embed_is_deterministic_and_puts_related_texts_closer():
    a, b, c = embed(["the agent loop", "agent loop again", "token window"], FakeModel())
    assert np.allclose(a, embed(["the agent loop"], FakeModel())[0])
    assert a @ b > a @ c


def test_embed_handles_an_empty_list_and_an_all_zero_vector():
    assert len(embed([], FakeModel())) == 0
    zero = embed(["unrelated words"], FakeModel())
    assert zero.shape == (1, len(VOCAB)) and not np.isnan(zero).any()


def test_the_real_model_gives_384_numbers_per_text():
    if os.environ.get("RAG_LIVE") != "1":
        pytest.skip("set RAG_LIVE=1 to download and run the real embedding model")
    vectors = embed(["hello world"])
    assert vectors.shape == (1, 384)
    assert np.isclose(np.linalg.norm(vectors[0]), 1.0, atol=1e-4)
