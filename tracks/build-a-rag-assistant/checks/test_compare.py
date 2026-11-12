import compare
import re


VOCAB = ["agent", "loop", "tool", "model", "window", "token", "retry", "error"]


class FakeModel:
    """A tiny stand-in for the embedding model: counts how often each VOCAB word appears."""

    def embed(self, texts):
        for text in texts:
            words = re.findall(r"[a-z]+", text.lower())
            yield [float(words.count(word)) for word in VOCAB]


def test_compare_prints_both_searches_and_saves_the_index(tmp_path, monkeypatch, capsys):
    notes = tmp_path / "notes"
    notes.mkdir()
    (notes / "loop.md").write_text("# Loop\n\nThe agent loop calls the model again and again.")
    (notes / "tokens.md").write_text("# Tokens\n\nA token is part of a word in the window.")
    monkeypatch.chdir(tmp_path)
    compare.main(["agent", "loop"], model=FakeModel())
    out = capsys.readouterr().out.lower()
    assert "keyword" in out and "embedding" in out
    assert "loop.md" in out
    assert (tmp_path / ".rag").exists()
