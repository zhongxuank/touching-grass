import pytest

from agent.tools import TOOLS, run_tool
from chat.backend import BACKEND, agent_reply


def test_agent_reply_returns_the_text_the_tool_calls_and_the_sources(monkeypatch):
    monkeypatch.setitem(TOOLS, "search_notes", lambda query: "[loop.md] The agent loop repeats.")
    seen = {}

    def fake_agent(prompt, **kwargs):
        seen["prompt"] = prompt
        seen["kwargs"] = kwargs
        run_tool("search_notes", {"query": "loop"})
        run_tool("add", {"a": 1, "b": 2})
        return "the loop repeats [loop.md]"

    monkeypatch.setitem(BACKEND, "agent", fake_agent)
    history = [{"role": "user", "content": "my name is Ada"}]
    result = agent_reply(history, "what is the loop?", provider="claude")
    assert result.text == "the loop repeats [loop.md]"
    assert [call["name"] for call in result.calls] == ["search_notes", "add"]
    assert result.sources == ["loop.md"]
    assert "my name is Ada" in seen["prompt"]
    assert "what is the loop?" in seen["prompt"]
    assert seen["kwargs"]["provider"] == "claude"


def test_an_answer_without_tools_has_no_calls_and_no_sources(monkeypatch):
    monkeypatch.setitem(BACKEND, "agent", lambda prompt, **kwargs: "just chatting")
    result = agent_reply([], "hi")
    assert result.text == "just chatting"
    assert result.calls == []
    assert result.sources == []


def test_a_failing_agent_raises_and_the_tools_are_restored(monkeypatch):
    def broken_agent(prompt, **kwargs):
        raise RuntimeError("no key")

    monkeypatch.setitem(BACKEND, "agent", broken_agent)
    before = dict(TOOLS)
    with pytest.raises(RuntimeError):
        agent_reply([], "hi")
    assert TOOLS == before


def test_the_older_ways_to_answer_are_still_there():
    assert {"ask", "stream", "agent"} <= set(BACKEND)
