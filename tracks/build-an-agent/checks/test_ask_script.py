import ask as script


def test_main_prints_the_answer_to_the_words_it_is_given(monkeypatch, capsys):
    seen = []
    monkeypatch.setattr(script, "ask", lambda prompt: seen.append(prompt) or "pong")
    script.main(["What", "is", "an", "LLM?"])
    assert seen == ["What is an LLM?"]
    assert "pong" in capsys.readouterr().out


def test_main_uses_a_default_prompt_when_given_no_words(monkeypatch, capsys):
    seen = []
    monkeypatch.setattr(script, "ask", lambda prompt: seen.append(prompt) or "hello")
    script.main([])
    assert len(seen) == 1 and seen[0].strip()
    assert "hello" in capsys.readouterr().out
