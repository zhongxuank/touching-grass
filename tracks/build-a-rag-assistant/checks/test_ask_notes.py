import ask_notes
import re


VOCAB = ["agent", "loop", "tool", "model", "window", "token", "retry", "error"]


class FakeModel:
    """A tiny stand-in for the embedding model: counts how often each VOCAB word appears."""

    def embed(self, texts):
        for text in texts:
            words = re.findall(r"[a-z]+", text.lower())
            yield [float(words.count(word)) for word in VOCAB]


def write_notes(tmp_path):
    notes = tmp_path / "notes"
    notes.mkdir()
    (notes / "loop.md").write_text("# Loop\n\nThe agent loop calls the model again and again.")


def test_main_prints_the_answer_and_the_sources_used(tmp_path, monkeypatch, capsys):
    write_notes(tmp_path)
    monkeypatch.chdir(tmp_path)
    ask_notes.main(
        ["agent", "loop"],
        ask_fn=lambda prompt, *, system: "the loop repeats",
        model=FakeModel(),
        min_score=0.1,
    )
    out = capsys.readouterr().out
    assert "the loop repeats" in out
    assert "loop.md" in out


def test_main_shows_the_dont_know_reply_for_an_unrelated_question(tmp_path, monkeypatch, capsys):
    write_notes(tmp_path)
    monkeypatch.chdir(tmp_path)

    def must_not_be_called(prompt, *, system):
        raise AssertionError("the model should not be called")

    ask_notes.main(["weather"], ask_fn=must_not_be_called, model=FakeModel(), min_score=0.1)
    assert capsys.readouterr().out.strip()
