from chat.backend import BACKEND, reply, stream_reply


def test_stream_reply_streams_the_pieces_for_the_history_and_question(monkeypatch):
    seen = {}

    def fake_stream(prompt, **kwargs):
        seen["prompt"] = prompt
        seen["kwargs"] = kwargs
        return iter(["Hel", "lo"])

    monkeypatch.setitem(BACKEND, "stream", fake_stream)
    history = [{"role": "user", "content": "my name is Ada"}]
    pieces = stream_reply(history, "what is my name?", provider="openai")
    assert list(pieces) == ["Hel", "lo"]
    assert "my name is Ada" in seen["prompt"]
    assert "what is my name?" in seen["prompt"]
    assert seen["kwargs"]["provider"] == "openai"
    assert seen["kwargs"]["system"]


def test_stream_reply_defaults_to_no_chosen_provider(monkeypatch):
    seen = {}

    def fake_stream(prompt, **kwargs):
        seen.update(kwargs)
        return iter([])

    monkeypatch.setitem(BACKEND, "stream", fake_stream)
    list(stream_reply([], "hi"))
    assert seen["provider"] is None


def test_reply_still_works_beside_the_stream(monkeypatch):
    assert callable(BACKEND["stream"])
    monkeypatch.setitem(BACKEND, "ask", lambda prompt, **kwargs: "whole answer")
    assert reply([], "hi") == "whole answer"
