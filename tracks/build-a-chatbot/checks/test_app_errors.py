from pathlib import Path

from streamlit.testing.v1 import AppTest

from agent.tools import TOOLS, run_tool
from chat.backend import BACKEND

APP = str(Path("app.py").resolve())


def use_fake_models(monkeypatch, agent):
    """Replace every model call the page can make with a fake, so no key is needed."""

    def fake_stream(prompt, **kwargs):
        return iter(["a fake reply"])

    fakes = {"ask": agent, "stream": fake_stream, "agent": agent}
    for name in list(BACKEND):
        monkeypatch.setitem(BACKEND, name, fakes[name])


def test_a_failing_model_shows_an_error_instead_of_crashing(monkeypatch):
    def broken(prompt, **kwargs):
        raise RuntimeError("ANTHROPIC_API_KEY is missing.")

    use_fake_models(monkeypatch, broken)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("hello").run()
    assert not at.exception
    assert len(at.error) >= 1
    assert "ANTHROPIC_API_KEY is missing." in at.error[0].value
    history = at.session_state["history"]
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[1]["error"] is True


def test_the_error_stays_on_the_page_and_the_chat_continues(monkeypatch):
    prompts = []

    def flaky(prompt, **kwargs):
        prompts.append(prompt)
        if len(prompts) == 1:
            raise RuntimeError("the provider is down")
        return "back again"

    use_fake_models(monkeypatch, flaky)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("first question").run()
    at.chat_input[0].set_value("second question").run()
    assert not at.exception
    assert len(at.error) == 1
    assert len(at.chat_message) == 4
    assert "the provider is down" not in prompts[-1]
    assert "first question" in prompts[-1]
    assert "back again" in at.chat_message[3].markdown[0].value


def test_a_failing_stream_is_shown_as_an_error_too(monkeypatch):
    def agent(prompt, **kwargs):
        return "fine"

    def broken_stream(prompt, **kwargs):
        raise RuntimeError("no key")

    use_fake_models(monkeypatch, agent)
    monkeypatch.setitem(BACKEND, "stream", broken_stream)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.toggle[0].set_value(False).run()
    at.chat_input[0].set_value("hello").run()
    assert not at.exception
    assert len(at.error) == 1


def test_notes_used_by_an_answer_are_shown_as_sources(monkeypatch):
    monkeypatch.setitem(TOOLS, "search_notes", lambda query: "[loop.md] The agent loop repeats.")

    def agent(prompt, **kwargs):
        run_tool("search_notes", {"query": "loop"})
        return "the loop repeats"

    use_fake_models(monkeypatch, agent)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("what is the loop?").run()
    assert not at.exception
    assert any("loop.md" in caption.value for caption in at.caption)
    at.chat_input[0].set_value("and again").run()
    assert any("loop.md" in caption.value for caption in at.caption)
    assert at.session_state["history"][1]["sources"] == ["loop.md"]
