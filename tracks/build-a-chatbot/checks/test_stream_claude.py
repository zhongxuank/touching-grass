import inspect

from agent import stream_claude


class FakeStream:
    def __init__(self, parts):
        self.text_stream = iter(parts)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeMessages:
    def __init__(self, parts):
        self.parts = parts
        self.kwargs = None

    def stream(self, **kwargs):
        self.kwargs = kwargs
        return FakeStream(self.parts)


class FakeClient:
    def __init__(self, parts):
        self.messages = FakeMessages(parts)


def test_stream_is_a_generator_that_yields_the_text_pieces():
    assert inspect.isgeneratorfunction(stream_claude.stream)
    client = FakeClient(["Hel", "lo", "!"])
    pieces = list(stream_claude.stream("hi", client=client))
    assert pieces == ["Hel", "lo", "!"]


def test_stream_sends_the_prompt_the_system_text_and_a_token_limit():
    client = FakeClient(["ok"])
    list(stream_claude.stream("my question", client=client, system="be brief", max_tokens=50))
    sent = client.messages.kwargs
    assert sent["system"] == "be brief"
    assert sent["max_tokens"] == 50
    assert sent["model"] == stream_claude.MODEL
    assert sent["messages"][0]["role"] == "user"
    assert "my question" in sent["messages"][0]["content"]
