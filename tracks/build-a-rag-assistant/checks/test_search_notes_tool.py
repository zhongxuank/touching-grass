import pytest

from agent.tools import TOOLS, run_tool
import re


VOCAB = ["agent", "loop", "tool", "model", "window", "token", "retry", "error"]


class FakeModel:
    """A tiny stand-in for the embedding model: counts how often each VOCAB word appears."""

    def embed(self, texts):
        for text in texts:
            words = re.findall(r"[a-z]+", text.lower())
            yield [float(words.count(word)) for word in VOCAB]


@pytest.fixture
def notes_folder(tmp_path, monkeypatch):
    notes = tmp_path / "notes"
    notes.mkdir()
    (notes / "loop.md").write_text("# Loop\n\nThe agent loop calls the model again and again.")
    (notes / "tokens.md").write_text("# Tokens\n\nA token is part of a word in the window.")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("rag.embedder.load_model", lambda: FakeModel())
    return notes


def test_search_notes_is_a_tool_and_the_old_tools_still_work():
    assert {"search_notes", "add", "get_time"} <= set(TOOLS)
    assert "5" in run_tool("add", {"a": 2, "b": 3})


def test_it_returns_matching_passages_labelled_with_their_file(notes_folder):
    result = run_tool("search_notes", {"query": "agent loop model"})
    assert isinstance(result, str)
    assert "[loop.md]" in result
    assert "[tokens.md]" not in result


def test_it_says_so_when_nothing_in_the_notes_is_relevant(notes_folder):
    result = run_tool("search_notes", {"query": "weather forecast"})
    assert result.strip()
    assert "[loop.md]" not in result and "[tokens.md]" not in result
    assert not result.startswith("Error")
