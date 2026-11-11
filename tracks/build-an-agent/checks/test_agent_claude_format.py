from types import SimpleNamespace

from agent.agent_claude import find_tool_uses, to_claude_tools, tool_results_message
from agent.tool_specs import TOOL_SPECS


def test_to_claude_tools_uses_input_schema():
    tools = to_claude_tools(TOOL_SPECS)
    assert len(tools) == len(TOOL_SPECS)
    for tool, spec in zip(tools, TOOL_SPECS):
        assert tool["name"] == spec["name"]
        assert tool["description"]
        assert tool["input_schema"]["type"] == "object"
        assert "parameters" not in tool


def test_find_tool_uses_picks_out_only_tool_use_blocks():
    text = SimpleNamespace(type="text", text="let me check")
    use = SimpleNamespace(type="tool_use", id="t1", name="add", input={"a": 1, "b": 2})
    response = SimpleNamespace(content=[text, use], stop_reason="tool_use")
    assert find_tool_uses(response) == [use]
    assert find_tool_uses(SimpleNamespace(content=[text])) == []


def test_tool_results_message_answers_each_call_by_id():
    uses = [
        SimpleNamespace(type="tool_use", id="t1", name="add", input={"a": 1, "b": 2}),
        SimpleNamespace(type="tool_use", id="t2", name="add", input={"a": 10, "b": 5}),
    ]
    message = tool_results_message(uses)
    assert message["role"] == "user"
    blocks = message["content"]
    assert [b["tool_use_id"] for b in blocks] == ["t1", "t2"]
    assert all(b["type"] == "tool_result" for b in blocks)
    assert "3" in blocks[0]["content"] and "15" in blocks[1]["content"]
