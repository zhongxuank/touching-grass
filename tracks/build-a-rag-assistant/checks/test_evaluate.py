from pathlib import Path

from rag.chunks import Chunk, Hit
from rag.evaluate import EVAL_CASES, hit_rate

CASES = [("q1", "a.md"), ("q2", "b.md"), ("q3", "a.md"), ("q4", "b.md")]


def hits_for(*sources):
    return [Hit(Chunk(source, 0, "text"), 1.0) for source in sources]


def test_hit_rate_is_the_share_of_questions_whose_note_was_found():
    assert hit_rate(lambda q: hits_for("a.md", "b.md"), CASES) == 1.0
    assert hit_rate(lambda q: [], CASES) == 0.0
    answers = {"q1": ["a.md"], "q2": ["a.md"], "q3": ["b.md", "a.md"], "q4": []}
    assert hit_rate(lambda q: hits_for(*answers[q]), CASES) == 0.5


def test_the_evaluation_has_several_cases_that_point_at_real_notes():
    assert len(EVAL_CASES) >= 5
    notes = {path.name for path in Path("notes").glob("*.md")}
    for question, expected in EVAL_CASES:
        assert question.strip()
        assert expected in notes
