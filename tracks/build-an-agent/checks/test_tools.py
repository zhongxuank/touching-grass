from datetime import datetime

from agent.tools import TOOLS, add, get_time, run_tool


def test_add_adds_two_numbers():
    assert add(2, 3) == 5
    assert add(0.5, 0.25) == 0.75


def test_get_time_returns_a_parseable_timestamp():
    stamp = get_time()
    assert isinstance(stamp, str)
    assert isinstance(datetime.fromisoformat(stamp), datetime)


def test_run_tool_returns_a_string_result():
    result = run_tool("add", {"a": 2, "b": 3})
    assert isinstance(result, str)
    assert "5" in result
    assert run_tool("get_time", {})


def test_run_tool_reports_errors_instead_of_raising():
    assert "Error" in run_tool("no_such_tool", {})
    assert "Error" in run_tool("add", {"a": 1})
    assert set(TOOLS) >= {"add", "get_time"}
