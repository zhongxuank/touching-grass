from chat.history import add_message, build_prompt


def test_add_message_keeps_extra_details():
    history = []
    add_message(history, "assistant", "hi", calls=[{"name": "add"}], sources=["a.md"])
    assert history[0]["role"] == "assistant"
    assert history[0]["content"] == "hi"
    assert history[0]["calls"] == [{"name": "add"}]
    assert history[0]["sources"] == ["a.md"]


def test_add_message_without_extras_still_works():
    history = []
    add_message(history, "user", "hi")
    assert history == [{"role": "user", "content": "hi"}]


def test_build_prompt_leaves_error_messages_out():
    history = []
    add_message(history, "user", "first question")
    add_message(history, "assistant", "The Provider rejected your API key.", error=True)
    prompt = build_prompt(history, "second question")
    assert "first question" in prompt
    assert "second question" in prompt
    assert "rejected" not in prompt


def test_build_prompt_with_only_errors_is_just_the_question():
    history = [{"role": "assistant", "content": "something broke", "error": True}]
    assert build_prompt(history, "hello") == "hello"
