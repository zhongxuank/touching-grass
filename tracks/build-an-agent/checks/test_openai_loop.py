import json
from types import SimpleNamespace

import pytest

from agent.openai_loop import assistant_message, run_loop, tool_messages, to_openai_tools
from agent.tool_specs import TOOL_SPECS


def tool_call(call_id, name, args):
    function = SimpleNamespace(name=name, arguments=json.dumps(args))
    return SimpleNamespace(id=call_id, function=function)


def response(content=None, calls=None):
    message = SimpleNamespace(content=content, tool_calls=calls)
    finish = "tool_calls" if calls else "stop"
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish)])


class ScriptedCompletions:
    def __init__(self, responses):
        self.responses = list(responses)
        self.sent = []

    def create(self, **kwargs):
        self.sent.append(list(kwargs["messages"]))
        self.last = kwargs
        return self.responses.pop(0)


def scripted(responses):
    return SimpleNamespace(chat=SimpleNamespace(completions=ScriptedCompletions(responses)))


def test_to_openai_tools_wraps_each_spec_as_a_function():
    tools = to_openai_tools(TOOL_SPECS)
    assert len(tools) == len(TOOL_SPECS)
    for tool, spec in zip(tools, TOOL_SPECS):
        assert tool["type"] == "function"
        assert tool["function"]["name"] == spec["name"]
        assert tool["function"]["parameters"]["type"] == "object"


def test_assistant_and_tool_messages_match_the_call_ids():
    message = SimpleNamespace(content=None, tool_calls=[tool_call("c1", "add", {"a": 2, "b": 3})])
    assistant = assistant_message(message)
    assert assistant["role"] == "assistant"
    assert assistant["tool_calls"][0]["id"] == "c1"
    results = tool_messages(message)
    assert results[0]["role"] == "tool"
    assert results[0]["tool_call_id"] == "c1"
    assert "5" in results[0]["content"]


def test_bad_json_arguments_become_an_error_result():
    bad = SimpleNamespace(id="c1", function=SimpleNamespace(name="add", arguments="{oops"))
    message = SimpleNamespace(content=None, tool_calls=[bad])
    assert "Error" in tool_messages(message)[0]["content"]


def test_returns_text_when_no_tool_is_needed():
    client = scripted([response("hello")])
    assert run_loop(client, "some-model", "hi") == "hello"
    assert client.chat.completions.last["tools"]
    assert client.chat.completions.sent[0][0]["role"] == "system"


def test_runs_the_tool_and_sends_the_result_back():
    client = scripted(
        [response(calls=[tool_call("c1", "add", {"a": 2, "b": 3})]), response("The sum is 5")]
    )
    assert "5" in run_loop(client, "some-model", "what is 2+3?")
    second = client.chat.completions.sent[1]
    assert [m["role"] for m in second] == ["system", "user", "assistant", "tool"]
    assert second[-1]["tool_call_id"] == "c1"


def test_stops_after_max_steps():
    client = scripted([response(calls=[tool_call(f"c{i}", "get_time", {})]) for i in range(10)])
    with pytest.raises(RuntimeError):
        run_loop(client, "some-model", "loop", max_steps=3)
    assert len(client.chat.completions.sent) == 3
