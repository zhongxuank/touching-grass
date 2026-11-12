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


def test_the_page_starts_without_errors_and_with_a_chat_box():
    at = AppTest.from_file(APP, default_timeout=10).run()
    assert not at.exception
    assert len(at.chat_input) == 1
    assert len(at.chat_message) == 0


def test_a_message_gets_a_reply_from_the_model(monkeypatch):
    use_fake_models(monkeypatch)
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("hello there").run()
    assert not at.exception
    assert len(at.chat_message) == 2
    assert at.chat_message[0].markdown[0].value == "hello there"
    assert "a fake reply" in at.chat_message[1].markdown[0].value
