import os
from types import SimpleNamespace

import pytest

from agent.config import load_env
from agent.llm_claude import MODEL, ask, response_text


class FakeMessages:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        blocks = [SimpleNamespace(type="text", text="hello "), SimpleNamespace(type="text", text="there")]
        return SimpleNamespace(content=blocks, stop_reason="end_turn")


def test_response_text_joins_only_text_blocks():
    response = SimpleNamespace(
        content=[SimpleNamespace(type="text", text="a"), SimpleNamespace(type="tool_use")]
    )
    assert response_text(response) == "a"


def test_response_text_skips_a_leading_thinking_block():
    response = SimpleNamespace(
        content=[
            SimpleNamespace(type="thinking", thinking="hmm"),
            SimpleNamespace(type="text", text="the answer"),
        ]
    )
    assert response_text(response) == "the answer"


def test_ask_sends_the_prompt_as_a_user_message_and_returns_text():
    fake = SimpleNamespace(messages=FakeMessages())
    answer = ask("what is 2+2?", client=fake, max_tokens=20)
    assert isinstance(answer, str) and answer
    sent = fake.messages.calls[0]
    assert sent["messages"][0]["role"] == "user"
    assert "what is 2+2?" in sent["messages"][0]["content"]
    assert sent["max_tokens"] == 20
    assert sent["system"]
    assert sent["output_config"] == {"effort": "low"}
    assert not {"temperature", "top_p", "top_k", "thinking"} & set(sent)


def test_ask_calls_the_real_api():
    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        pytest.skip("ANTHROPIC_API_KEY is not set")
    answer = ask("Say hi in one word.")
    assert isinstance(answer, str) and answer.strip()
    assert MODEL
