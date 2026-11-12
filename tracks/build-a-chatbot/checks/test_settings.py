import pytest

from chat import settings

KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"]


@pytest.fixture
def no_keys(monkeypatch):
    monkeypatch.setattr(settings, "load_env", lambda: None)
    for key in KEYS:
        monkeypatch.delenv(key, raising=False)
    return monkeypatch


def test_available_providers_lists_only_providers_with_a_key(no_keys):
    assert settings.available_providers() == []
    no_keys.setenv("OPENAI_API_KEY", "sk-test")
    no_keys.setenv("ANTHROPIC_API_KEY", "   ")
    assert settings.available_providers() == ["openai"]
    no_keys.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    assert set(settings.available_providers()) == {"claude", "openai"}


def test_model_for_gives_a_model_name_for_each_provider():
    for name in ["claude", "openai", "openrouter"]:
        model = settings.model_for(name)
        assert isinstance(model, str) and model


def test_estimate_tokens_grows_with_the_text():
    assert settings.estimate_tokens("") == 0
    short = settings.estimate_tokens("hello there")
    long = settings.estimate_tokens("hello there " * 50)
    assert 0 < short < long


def test_conversation_stats_counts_messages_and_tokens():
    history = [
        {"role": "user", "content": "hello there, how are you today?"},
        {"role": "assistant", "content": "I am fine, thank you for asking."},
    ]
    stats = settings.conversation_stats(history)
    assert stats["messages"] == 2
    assert stats["tokens"] > 0
    history.append({"role": "user", "content": "tell me a long story " * 20})
    bigger = settings.conversation_stats(history)
    assert bigger["messages"] == 3
    assert bigger["tokens"] > stats["tokens"]
    assert settings.conversation_stats([]) == {"messages": 0, "tokens": 0}
