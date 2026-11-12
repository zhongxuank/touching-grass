from chat.backend import BACKEND, reply


def test_ask_is_the_default_backend():
    assert callable(BACKEND["ask"])


def test_reply_sends_the_history_and_question_to_the_backend(monkeypatch):
    seen = {}

    def fake_ask(prompt, **kwargs):
        seen["prompt"] = prompt
        seen["kwargs"] = kwargs
        return "a fake answer"

    monkeypatch.setitem(BACKEND, "ask", fake_ask)
    history = [{"role": "user", "content": "my name is Ada"}]
    result = reply(history, "what is my name?")
    assert result == "a fake answer"
    assert "my name is Ada" in seen["prompt"]
    assert "what is my name?" in seen["prompt"]
    assert seen["kwargs"].get("system")
