from rag.chunks import Chunk
from rag.keyword import keyword_search

CHUNKS = [
    Chunk("a.md", 0, "The agent loop sends messages to the model."),
    Chunk("b.md", 0, "A token is about three quarters of a word."),
    Chunk("c.md", 0, "Retry the call when the API fails."),
]


def test_the_chunk_sharing_the_most_words_comes_first():
    hits = keyword_search("what is a token", CHUNKS)
    assert hits[0].chunk.source == "b.md"
    assert hits[0].score > 0


def test_scores_are_sorted_best_first_and_limited_to_top_k():
    hits = keyword_search("agent loop model token", CHUNKS, top_k=2)
    assert len(hits) <= 2
    assert [h.score for h in hits] == sorted((h.score for h in hits), reverse=True)


def test_a_question_with_no_matching_words_finds_nothing():
    assert keyword_search("zebra giraffe", CHUNKS) == []


def test_stopwords_alone_never_match():
    assert keyword_search("the of a to", CHUNKS) == []
