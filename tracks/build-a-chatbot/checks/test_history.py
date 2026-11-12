from chat.history import add_message, build_prompt


def test_add_message_appends_a_role_and_content():
    history = []
    add_message(history, "user", "hi")
    add_message(history, "assistant", "hello")
    assert len(history) == 2
    assert history[0]["role"] == "user" and history[0]["content"] == "hi"
    assert history[1]["role"] == "assistant"


def test_build_prompt_without_history_is_just_the_question():
    assert build_prompt([], "what is a token?") == "what is a token?"


def test_build_prompt_includes_earlier_turns_and_the_new_question():
    history = []
    add_message(history, "user", "my name is Ada")
    add_message(history, "assistant", "nice to meet you")
    prompt = build_prompt(history, "what is my name?")
    assert "my name is Ada" in prompt
    assert "nice to meet you" in prompt
    assert "what is my name?" in prompt
    assert prompt.index("my name is Ada") < prompt.index("what is my name?")


def test_build_prompt_does_not_change_the_history():
    history = [{"role": "user", "content": "hi"}]
    build_prompt(history, "again")
    assert len(history) == 1
