import pytest

from agent.tools import TOOLS, run_tool
from chat.trace import record_tool_calls


def test_it_records_the_name_arguments_and_result_of_a_tool_call():
    with record_tool_calls() as calls:
        result = run_tool("add", {"a": 2, "b": 3})
    assert "5" in result
    assert len(calls) == 1
    assert calls[0]["name"] == "add"
    assert calls[0]["args"] == {"a": 2, "b": 3}
    assert "5" in calls[0]["result"]
    assert calls[0]["error"] is False


def test_a_failing_tool_is_recorded_as_an_error_and_still_reported_to_the_model():
    with record_tool_calls() as calls:
        result = run_tool("add", {"a": "x"})
    assert result.startswith("Error")
    assert len(calls) == 1
    assert calls[0]["error"] is True
    assert calls[0]["result"].startswith("Error")


def test_the_original_tools_come_back_after_the_block():
    originals = dict(TOOLS)
    with record_tool_calls():
        assert TOOLS["add"] is not originals["add"]
    assert TOOLS == originals


def test_the_original_tools_come_back_even_if_the_block_raises():
    originals = dict(TOOLS)
    with pytest.raises(RuntimeError):
        with record_tool_calls():
            raise RuntimeError("boom")
    assert TOOLS == originals


def test_each_block_records_only_its_own_calls():
    with record_tool_calls() as first:
        run_tool("add", {"a": 1, "b": 1})
    with record_tool_calls() as second:
        run_tool("get_time", {})
        run_tool("get_time", {})
    assert len(first) == 1
    assert len(second) == 2
