import numpy as np

from rag.chunks import Chunk
from rag.index import build_index
from rag.store import get_index, load_index, save_index
import re


VOCAB = ["agent", "loop", "tool", "model", "window", "token", "retry", "error"]


class FakeModel:
    """A tiny stand-in for the embedding model: counts how often each VOCAB word appears."""

    def embed(self, texts):
        for text in texts:
            words = re.findall(r"[a-z]+", text.lower())
            yield [float(words.count(word)) for word in VOCAB]


class CountingModel(FakeModel):
    def __init__(self):
        self.calls = 0

    def embed(self, texts):
        self.calls += 1
        return super().embed(texts)


def write_notes(folder, text="The agent loop calls the model."):
    folder.mkdir(exist_ok=True)
    (folder / "a.md").write_text("# A\n\n" + text)


def test_a_saved_index_loads_back_the_same(tmp_path):
    index = build_index([Chunk("a.md", 0, "agent loop"), Chunk("b.md", 1, "token window")], FakeModel())
    save_index(index, str(tmp_path / ".rag"))
    loaded = load_index(str(tmp_path / ".rag"))
    assert loaded.chunks == index.chunks
    assert np.allclose(loaded.vectors, index.vectors)


def test_loading_before_anything_is_saved_gives_none(tmp_path):
    assert load_index(str(tmp_path / ".rag")) is None


def test_get_index_embeds_once_and_reuses_the_saved_index(tmp_path):
    write_notes(tmp_path / "notes")
    model = CountingModel()
    first = get_index(str(tmp_path / "notes"), str(tmp_path / ".rag"), model)
    second = get_index(str(tmp_path / "notes"), str(tmp_path / ".rag"), model)
    assert model.calls == 1
    assert first.chunks == second.chunks
    assert (tmp_path / ".rag").exists()


def test_get_index_rebuilds_when_a_note_changes(tmp_path):
    write_notes(tmp_path / "notes")
    model = CountingModel()
    get_index(str(tmp_path / "notes"), str(tmp_path / ".rag"), model)
    write_notes(tmp_path / "notes", "A token is part of a word.")
    index = get_index(str(tmp_path / "notes"), str(tmp_path / ".rag"), model)
    assert model.calls == 2
    assert "token" in index.chunks[0].text
