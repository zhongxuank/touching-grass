import logging
from types import SimpleNamespace

import pytest

import agent.llm as llm

KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "LLM_PROVIDER"]


@pytest.fixture
def clean_env(monkeypatch):
    monkeypatch.setattr(llm, "load_env", lambda: None)
    for name in KEYS:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_choose_provider_uses_the_explicit_setting(clean_env):
    clean_env.setenv("ANTHROPIC_API_KEY", "a")
    clean_env.setenv("LLM_PROVIDER", "openai")
    assert llm.choose_provider() == "openai"


def test_choose_provider_falls_back_to_the_first_key_present(clean_env):
    clean_env.setenv("OPENROUTER_API_KEY", "k")
    assert llm.choose_provider() == "openrouter"


def test_choose_provider_rejects_unknown_names_and_missing_keys(clean_env):
    with pytest.raises(RuntimeError):
        llm.choose_provider()
    clean_env.setenv("LLM_PROVIDER", "nope")
    with pytest.raises(ValueError):
        llm.choose_provider()


def test_ask_logs_what_it_sends_and_returns_the_answer(clean_env, caplog):
    seen = {}

    def fake_ask(prompt, *, system, max_tokens):
        seen.update(prompt=prompt, system=system, max_tokens=max_tokens)
        return "pong"

    clean_env.setattr(llm, "load_provider", lambda name: SimpleNamespace(ask=fake_ask))
    with caplog.at_level(logging.INFO, logger="agent"):
        answer = llm.ask("ping", provider="claude", max_tokens=7)
    assert answer == "pong"
    assert seen["prompt"] == "ping" and seen["max_tokens"] == 7
    assert "ping" in caplog.text


def test_ask_retries_a_transient_error(clean_env):
    calls = []

    class Overloaded(Exception):
        status_code = 529

    def flaky(prompt, *, system, max_tokens):
        calls.append(1)
        if len(calls) == 1:
            raise Overloaded("busy")
        return "ok"

    clean_env.setattr(llm, "load_provider", lambda name: SimpleNamespace(ask=flaky))
    clean_env.setattr("agent.retry.time.sleep", lambda s: None)
    assert llm.ask("hi", provider="openai") == "ok"
    assert len(calls) == 2


def test_ask_calls_a_real_llm():
    try:
        llm.choose_provider()
    except RuntimeError:
        pytest.skip("no API key is set")
    answer = llm.ask("Say hi in one word.", max_tokens=20)
    assert isinstance(answer, str) and answer.strip()
