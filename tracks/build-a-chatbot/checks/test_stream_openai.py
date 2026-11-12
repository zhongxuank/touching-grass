import inspect
from types import SimpleNamespace

from agent import stream_openai


def chunk(content, with_choice=True):
    if not with_choice:
        return SimpleNamespace(choices=[])
    return SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=content))])


class FakeCompletions:
    def __init__(self, chunks):
        self.chunks = chunks
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return iter(self.chunks)


class FakeClient:
    def __init__(self, chunks):
        self.completions = FakeCompletions(chunks)
        self.chat = SimpleNamespace(completions=self.completions)


def test_stream_yields_only_the_text_pieces():
    assert inspect.isgeneratorfunction(stream_openai.stream)
    client = FakeClient([chunk(None), chunk("Hel"), chunk("", with_choice=False), chunk("lo"), chunk(None)])
    assert list(stream_openai.stream("hi", client=client)) == ["Hel", "lo"]


def test_stream_asks_for_a_stream_and_sends_the_system_and_user_messages():
    client = FakeClient([chunk("ok")])
    list(stream_openai.stream("my question", client=client, system="be brief", max_tokens=50))
    sent = client.completions.kwargs
    assert sent["stream"] is True
    assert sent["max_tokens"] == 50
    assert sent["model"] == stream_openai.MODEL
    roles = [m["role"] for m in sent["messages"]]
    assert roles == ["system", "user"]
    assert sent["messages"][0]["content"] == "be brief"
    assert "my question" in sent["messages"][1]["content"]
