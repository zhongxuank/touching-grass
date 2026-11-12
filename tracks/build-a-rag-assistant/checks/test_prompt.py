from rag.chunks import Chunk, Hit
from rag.prompt import SYSTEM, build_prompt

HITS = [
    Hit(Chunk("loop.md", 0, "The loop ends on plain text."), 0.9),
    Hit(Chunk("tools.md", 1, "The model never runs a tool."), 0.7),
]


def test_the_prompt_labels_every_chunk_with_its_file_name_and_holds_the_question():
    prompt = build_prompt("How does it end?", HITS)
    for hit in HITS:
        assert hit.chunk.source in prompt
        assert hit.chunk.text in prompt
    assert "How does it end?" in prompt
    assert prompt.index("The loop ends on plain text.") < prompt.index("How does it end?")


def test_there_is_a_system_prompt_with_rules_for_the_model():
    assert isinstance(SYSTEM, str) and len(SYSTEM) > 20
