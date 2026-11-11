import os
from types import SimpleNamespace

import pytest

from agent.agent_claude import run_agent
from agent.config import load_env


def text_response(text):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], stop_reason="end_turn")


def tool_response(name, args, call_id="t1"):
    block = SimpleNamespace(type="tool_use", id=call_id, name=name, input=args)
    return SimpleNamespace(content=[block], stop_reason="tool_use")


class ScriptedMessages:
    def __init__(self, responses):
        self.responses = list(responses)
        self.sent = []

    def create(self, **kwargs):
        self.sent.append(list(kwargs["messages"]))
        self.last = kwargs
        return self.responses.pop(0)


def scripted(responses):
    return SimpleNamespace(messages=ScriptedMessages(responses))


def test_returns_text_when_no_tool_is_needed():
    client = scripted([text_response("hello")])
    assert run_agent("hi", client=client) == "hello"
    assert client.messages.last["tools"]


def test_runs_the_tool_and_sends_the_result_back():
    client = scripted([tool_response("add", {"a": 2, "b": 3}), text_response("The sum is 5")])
    answer = run_agent("what is 2+3?", client=client)
    assert "5" in answer
    second_request = client.messages.sent[1]
    assert [m["role"] for m in second_request] == ["user", "assistant", "user"]
    result_block = second_request[-1]["content"][0]
    assert result_block["type"] == "tool_result"
    assert result_block["tool_use_id"] == "t1"
    assert "5" in result_block["content"]


def test_loops_through_several_tool_calls():
    client = scripted(
        [
            tool_response("get_time", {}, "t1"),
            tool_response("add", {"a": 1, "b": 1}, "t2"),
            text_response("done"),
        ]
    )
    assert run_agent("go", client=client) == "done"
    assert len(client.messages.sent) == 3


def test_stops_after_max_steps():
    client = scripted([tool_response("get_time", {}, f"t{i}") for i in range(10)])
    with pytest.raises(RuntimeError):
        run_agent("loop forever", client=client, max_steps=3)
    assert len(client.messages.sent) == 3


def test_real_model_uses_the_add_tool():
    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        pytest.skip("ANTHROPIC_API_KEY is not set")
    answer = run_agent("Use the add tool to add 1234 and 5678, then tell me the sum.")
    assert isinstance(answer, str)
    assert "6912" in answer.replace(",", "")
