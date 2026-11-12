from types import SimpleNamespace

import pytest

from agent import stream


def fake_streamer(seen, pieces=("Hel", "lo")):
    def fake_stream(prompt, **kwargs):
        seen["prompt"] = prompt
        seen["kwargs"] = kwargs
        return iter(pieces)

    return SimpleNamespace(stream=fake_stream)


def test_stream_ask_uses_the_streamer_of_the_chosen_provider(monkeypatch):
    seen = {}

    def fake_load(name):
        seen["name"] = name
        return fake_streamer(seen)

    monkeypatch.setattr(stream, "load_streamer", fake_load)
    result = stream.stream_ask("hi", provider="openai", system="be brief", max_tokens=20)
    assert list(result) == ["Hel", "lo"]
    assert seen["name"] == "openai"
    assert seen["prompt"] == "hi"
    assert seen["kwargs"]["system"] == "be brief"
    assert seen["kwargs"]["max_tokens"] == 20


def test_stream_ask_falls_back_to_the_provider_from_the_environment(monkeypatch):
    seen = {}

    def fake_load(name):
        seen["name"] = name
        return fake_streamer(seen)

    monkeypatch.setattr(stream, "load_streamer", fake_load)
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    list(stream.stream_ask("hi"))
    assert seen["name"] == "openrouter"


def test_an_unknown_provider_fails_when_called_not_on_the_first_piece(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "nope")
    with pytest.raises(ValueError):
        stream.stream_ask("hi")
