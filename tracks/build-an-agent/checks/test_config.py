import pytest

import agent.config as config


def test_get_key_returns_the_value_from_the_environment(monkeypatch):
    monkeypatch.setattr(config, "load_env", lambda: None)
    monkeypatch.setenv("SOME_TEST_KEY", "  abc123 ")
    key = config.get_key("SOME_TEST_KEY")
    assert isinstance(key, str)
    assert key == "abc123"


def test_get_key_raises_when_missing(monkeypatch):
    monkeypatch.setattr(config, "load_env", lambda: None)
    monkeypatch.delenv("SOME_TEST_KEY", raising=False)
    with pytest.raises(RuntimeError) as info:
        config.get_key("SOME_TEST_KEY")
    assert "SOME_TEST_KEY" in str(info.value)


def test_get_key_raises_when_empty(monkeypatch):
    monkeypatch.setattr(config, "load_env", lambda: None)
    monkeypatch.setenv("SOME_TEST_KEY", "   ")
    with pytest.raises(RuntimeError):
        config.get_key("SOME_TEST_KEY")


def test_load_env_reads_a_dotenv_file(tmp_path, monkeypatch):
    from dotenv import load_dotenv

    env_file = tmp_path / ".env"
    env_file.write_text("SOME_TEST_KEY=from-file\n")
    monkeypatch.delenv("SOME_TEST_KEY", raising=False)
    load_dotenv(env_file)
    monkeypatch.setattr(config, "load_env", lambda: None)
    assert config.get_key("SOME_TEST_KEY") == "from-file"
    monkeypatch.delenv("SOME_TEST_KEY", raising=False)
