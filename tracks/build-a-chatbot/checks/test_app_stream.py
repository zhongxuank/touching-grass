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
        return iter([text[:3], text[3:]])

    fakes = {"ask": fake, "stream": fake_stream, "agent": fake}
    for name in list(BACKEND):
        monkeypatch.setitem(BACKEND, name, fakes[name])
    return prompts


def test_streamed_pieces_end_up_as_one_reply_on_the_page(monkeypatch):
    use_fake_models(monkeypatch, text="a fake reply")
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("hello there").run()
    assert not at.exception
    assert len(at.chat_message) == 2
    assert "a fake reply" in at.chat_message[1].markdown[0].value


def test_the_streamed_reply_is_stored_in_the_history(monkeypatch):
    use_fake_models(monkeypatch, text="a fake reply")
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("hello there").run()
    history = at.session_state["history"]
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert "a fake reply" in history[1]["content"]
    at.chat_input[0].set_value("and again").run()
    assert len(at.chat_message) == 4
