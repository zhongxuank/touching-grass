from types import SimpleNamespace

import pytest

import agent.run as run


def test_run_agent_delegates_to_the_chosen_providers_agent(monkeypatch):
    seen = []
    fake = SimpleNamespace(run_agent=lambda prompt: seen.append(prompt) or "answer")
    loaded = []
    monkeypatch.setattr(run, "load_agent", lambda name: loaded.append(name) or fake)
    assert run.run_agent("hi", provider="openrouter") == "answer"
    assert loaded == ["openrouter"] and seen == ["hi"]


def test_run_agent_uses_choose_provider_when_none_is_given(monkeypatch):
    loaded = []
    fake = SimpleNamespace(run_agent=lambda prompt: "ok")
    monkeypatch.setattr(run, "choose_provider", lambda: "claude")
    monkeypatch.setattr(run, "load_agent", lambda name: loaded.append(name) or fake)
    assert run.run_agent("hi") == "ok"
    assert loaded == ["claude"]


def test_load_agent_rejects_an_unknown_provider():
    with pytest.raises(ImportError):
        run.load_agent("no_such_provider")
