import os
from types import SimpleNamespace

import pytest

from agent.config import load_env
from agent.llm_openai import ask, response_text


class FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        message = SimpleNamespace(content="hello there", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason="stop")])


def fake_client():
    return SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))


def test_response_text_handles_missing_content():
    message = SimpleNamespace(content=None)
    assert response_text(SimpleNamespace(choices=[SimpleNamespace(message=message)])) == ""


def test_ask_sends_a_system_message_then_the_user_prompt():
    client = fake_client()
    answer = ask("what is 2+2?", client=client, max_tokens=20)
    assert isinstance(answer, str) and answer
    sent = client.chat.completions.calls[0]
    roles = [m["role"] for m in sent["messages"]]
    assert roles == ["system", "user"]
    assert "what is 2+2?" in sent["messages"][1]["content"]
    assert sent["max_tokens"] == 20


def test_ask_calls_the_real_api():
    load_env()
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        pytest.skip("OPENAI_API_KEY is not set")
    answer = ask("Say hi in one word.", max_tokens=20)
    assert isinstance(answer, str) and answer.strip()
