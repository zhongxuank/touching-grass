import os
from types import SimpleNamespace

import pytest

from agent.config import load_env
from agent.llm_openrouter import BASE_URL, MODEL, ask


class FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        message = SimpleNamespace(content="hello there", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason="stop")])


def test_ask_sends_a_system_message_then_the_user_prompt():
    completions = FakeCompletions()
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    answer = ask("what is 2+2?", client=client, max_tokens=20)
    assert isinstance(answer, str) and answer
    sent = completions.calls[0]
    assert [m["role"] for m in sent["messages"]] == ["system", "user"]
    assert sent["model"] == MODEL


def test_the_client_points_at_openrouter(monkeypatch):
    from agent import llm_openrouter

    monkeypatch.setattr(llm_openrouter, "get_key", lambda name: "test-key")
    client = llm_openrouter.make_client()
    assert "openrouter" in str(client.base_url)
    assert "openrouter" in BASE_URL


def test_ask_calls_the_real_api():
    load_env()
    if not os.environ.get("OPENROUTER_API_KEY", "").strip():
        pytest.skip("OPENROUTER_API_KEY is not set")
    answer = ask("Say hi in one word.", max_tokens=20)
    assert isinstance(answer, str) and answer.strip()
