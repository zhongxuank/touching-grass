from pathlib import Path

from streamlit.testing.v1 import AppTest

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

    fakes = {"ask": fake, "stream": fake_stream, "agent": fake}
    for name in list(BACKEND):
        monkeypatch.setitem(BACKEND, name, fakes[name])
    return calls


def test_the_sidebar_offers_the_providers_that_have_a_key(monkeypatch):
    monkeypatch.setattr("chat.settings.available_providers", lambda: ["claude", "openai"])
    at = AppTest.from_file(APP, default_timeout=10).run()
    assert not at.exception
    assert at.sidebar.selectbox[0].options == ["claude", "openai"]
    assert any("Model" in caption.value for caption in at.sidebar.caption)


def test_without_any_key_the_sidebar_warns_instead_of_crashing(monkeypatch):
    monkeypatch.setattr("chat.settings.available_providers", lambda: [])
    at = AppTest.from_file(APP, default_timeout=10).run()
    assert not at.exception
    assert len(at.sidebar.warning) == 1


def test_the_chosen_provider_reaches_the_model_call(monkeypatch):
    calls = use_fake_models(monkeypatch)
    monkeypatch.setattr("chat.settings.available_providers", lambda: ["claude", "openai"])
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.sidebar.selectbox[0].set_value("openai").run()
    at.chat_input[0].set_value("hello").run()
    assert not at.exception
    assert calls[-1]["provider"] == "openai"


def test_clear_chat_empties_the_conversation(monkeypatch):
    use_fake_models(monkeypatch)
    monkeypatch.setattr("chat.settings.available_providers", lambda: ["claude"])
    at = AppTest.from_file(APP, default_timeout=10).run()
    at.chat_input[0].set_value("hello").run()
    assert len(at.chat_message) == 2
    at.sidebar.button[0].click().run()
    assert not at.exception
    assert len(at.chat_message) == 0
    assert at.session_state["history"] == []


def test_the_sidebar_shows_how_many_messages_there_are(monkeypatch):
    use_fake_models(monkeypatch)
    monkeypatch.setattr("chat.settings.available_providers", lambda: ["claude"])
    at = AppTest.from_file(APP, default_timeout=10).run()
    before = [c.value for c in at.sidebar.caption]
    at.chat_input[0].set_value("hello").run()
    after = [c.value for c in at.sidebar.caption]
    assert after != before
    assert any("2 messages" in value for value in after)
