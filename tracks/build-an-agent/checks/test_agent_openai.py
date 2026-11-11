import json
import os
from types import SimpleNamespace

import pytest

from agent.agent_openai import run_agent
from agent.config import load_env


def tool_call_response():
    call = SimpleNamespace(
        id="c1", function=SimpleNamespace(name="add", arguments=json.dumps({"a": 2, "b": 3}))
    )
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=None, tool_calls=[call]), finish_reason="tool_calls"
            )
        ]
    )


def final_response(text):
    message = SimpleNamespace(content=text, tool_calls=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason="stop")])


def test_run_agent_runs_a_tool_with_a_fake_client():
    responses = [tool_call_response(), final_response("The sum is 5")]
    completions = SimpleNamespace(create=lambda **kwargs: responses.pop(0))
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    assert "5" in run_agent("what is 2+3?", client=client)
    assert responses == []


def test_real_model_uses_the_add_tool():
    load_env()
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        pytest.skip("OPENAI_API_KEY is not set")
    answer = run_agent("Use the add tool to add 1234 and 5678, then tell me the sum.")
    assert isinstance(answer, str)
    assert "6912" in answer.replace(",", "")
