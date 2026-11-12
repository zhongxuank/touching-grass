from rag.answer import Answer, answer_question
from rag.chunks import Chunk
from rag.index import build_index
import re


VOCAB = ["agent", "loop", "tool", "model", "window", "token", "retry", "error"]


class FakeModel:
    """A tiny stand-in for the embedding model: counts how often each VOCAB word appears."""

    def embed(self, texts):
        for text in texts:
            words = re.findall(r"[a-z]+", text.lower())
            yield [float(words.count(word)) for word in VOCAB]

CHUNKS = [
    Chunk("loop.md", 0, "The agent loop calls the model again and again."),
    Chunk("tokens.md", 0, "A token is part of a word in the window."),
]


class FakeAsk:
    def __init__(self):
        self.prompts = []

    def __call__(self, prompt, *, system):
        self.prompts.append((prompt, system))
        return "An answer [loop.md]"


def test_a_relevant_question_asks_the_model_with_the_chunks_and_returns_the_sources():
    fake = FakeAsk()
    index = build_index(CHUNKS, FakeModel())
    result = answer_question("agent loop model", index=index, model=FakeModel(), ask_fn=fake, min_score=0.3)
    assert isinstance(result, Answer)
    assert result.text == "An answer [loop.md]"
    assert result.sources[0] == "loop.md"
    assert len(fake.prompts) == 1
    prompt, system = fake.prompts[0]
    assert "The agent loop calls the model" in prompt and "agent loop model" in prompt
    assert system


def test_below_the_threshold_it_says_it_does_not_know_and_never_calls_the_model():
    fake = FakeAsk()
    index = build_index(CHUNKS, FakeModel())
    result = answer_question("weather forecast", index=index, model=FakeModel(), ask_fn=fake, min_score=0.3)
    assert fake.prompts == []
    assert result.sources == []
    assert result.text.strip()
    assert result.best_score < 0.3


def test_chunks_under_the_threshold_are_left_out_of_the_prompt():
    fake = FakeAsk()
    index = build_index(CHUNKS, FakeModel())
    result = answer_question("agent loop", index=index, model=FakeModel(), ask_fn=fake, min_score=0.5)
    assert result.sources == ["loop.md"]
    assert "A token is part of a word" not in fake.prompts[0][0]
