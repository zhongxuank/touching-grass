from rag.chunks import Chunk, Hit, format_hit, split_text


def test_split_text_makes_one_chunk_per_paragraph_and_skips_titles():
    text = "# Title\n\nFirst paragraph here.\n\n\n\nSecond paragraph\nover two lines."
    assert split_text(text) == ["First paragraph here.", "Second paragraph over two lines."]


def test_split_text_of_nothing_is_empty():
    assert split_text("") == []
    assert split_text("# Only a title") == []


def test_long_paragraphs_are_split_at_sentence_ends_into_small_chunks():
    paragraph = " ".join(f"Sentence number {i} is here." for i in range(30))
    pieces = split_text(paragraph, max_chars=100)
    assert len(pieces) > 1
    assert all(0 < len(piece) <= 100 for piece in pieces)
    assert " ".join(pieces) == paragraph


def test_chunk_and_hit_hold_their_fields():
    chunk = Chunk("a.md", 2, "text")
    assert (chunk.source, chunk.position, chunk.text) == ("a.md", 2, "text")
    assert Chunk("a.md", 2, "text") == chunk
    hit = Hit(chunk, 0.5)
    assert hit.chunk == chunk and hit.score == 0.5


def test_format_hit_names_the_source_and_position():
    line = format_hit(Hit(Chunk("a.md", 2, "some text"), 0.5))
    assert isinstance(line, str) and "a.md" in line and "2" in line
