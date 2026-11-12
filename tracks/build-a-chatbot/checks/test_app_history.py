from pathlib import Path

from streamlit.testing.v1 import AppTest

from chat.backend import BACKEND

APP = str(Path("app.py").resolve())


def use_fake_models(monkeypatch, text="a fake reply"):
    """Replace every model call the page can make with a fake, so no key is needed."""
    prompts = []

    def fake(prompt, **kwargs):
        prompts.append(prompt)
        return text

    def fake_stream(prompt, **kwargs):
        prompts.append(prompt)
        return iter([text])

    fakes = {"ask": fake, "stream": fake_stream, "agent": fake}
    for name in list(BACKEND):
        monkeypatch.setitem(BACKEND, name, fakes[name])
    return prompts


def test_earlier_messages_stay_on_the_page(monkeypatch):
    use_fake_models(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("first question").run()
    at.chat_input[0].set_value("second question").run()
    assert not at.exception
    assert len(at.chat_message) == 4
    assert [m.name for m in at.chat_message] == ["user", "assistant", "user", "assistant"]
    assert at.chat_message[0].markdown[0].value == "first question"


def test_the_history_lives_in_session_state(monkeypatch):
    use_fake_models(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("first question").run()
    history = at.session_state["history"]
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[0]["content"] == "first question"


def test_the_second_question_reaches_the_model_with_the_first(monkeypatch):
    prompts = use_fake_models(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("my name is Ada").run()
    at.chat_input[0].set_value("what is my name?").run()
    assert "my name is Ada" in prompts[-1]
    assert "what is my name?" in prompts[-1]
