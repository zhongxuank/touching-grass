from pathlib import Path

from streamlit.testing.v1 import AppTest

from agent.tools import run_tool
from chat.backend import BACKEND

APP = str(Path("app.py").resolve())


def use_fake_models(monkeypatch, text="a fake reply"):
    """Replace every model call the page can make with a fake, so no key is needed."""
    calls = []

    def fake(prompt, **kwargs):
        calls.append(kwargs)
        return text

    def fake_stream(prompt, **kwargs):
        calls.append(kwargs)
        return iter([text])

    def fake_agent(prompt, **kwargs):
        calls.append(kwargs)
        run_tool("add", {"a": 2, "b": 3})
        return text

    fakes = {"ask": fake, "stream": fake_stream, "agent": fake_agent}
    for name in list(BACKEND):
        monkeypatch.setitem(BACKEND, name, fakes[name])
    return calls


def test_the_sidebar_has_a_toggle_for_using_the_notes_and_tools(monkeypatch):
    monkeypatch.setattr("chat.settings.available_providers", lambda: [])
    at = AppTest.from_file(APP, default_timeout=10).run()
    assert not at.exception
    assert len(at.toggle) == 1
    assert at.toggle[0].value is True


def test_a_tool_call_is_shown_in_a_status_box(monkeypatch):
    use_fake_models(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("what is 2 plus 3?").run()
    assert not at.exception
    assert len(at.status) == 1
    shown = [element.value for element in at.status[0].markdown] + [element.value for element in at.status[0].code]
    assert any("add" in value for value in shown)
    assert any("5" in value for value in shown)
    assert any("a fake reply" in element.value for element in at.chat_message[1].markdown)


def test_earlier_tool_calls_stay_visible_in_an_expander(monkeypatch):
    use_fake_models(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("what is 2 plus 3?").run()
    at.chat_input[0].set_value("and again").run()
    assert not at.exception
    assert len(at.expander) == 1
    history = at.session_state["history"]
    assert history[1]["calls"][0]["name"] == "add"


def test_with_the_toggle_off_the_answer_is_streamed_and_no_tools_run(monkeypatch):
    calls = use_fake_models(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.toggle[0].set_value(False).run()
    at.chat_input[0].set_value("hello").run()
    assert not at.exception
    assert len(at.status) == 0
    assert "a fake reply" in at.chat_message[1].markdown[0].value
    assert "calls" not in at.session_state["history"][1]
    assert len(calls) == 1
