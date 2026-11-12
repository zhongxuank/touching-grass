import pytest

from rag.notes import load_chunks


def test_load_chunks_reads_every_markdown_file_in_a_fixed_order(tmp_path):
    (tmp_path / "b.md").write_text("# B\n\nB one.\n\nB two.")
    (tmp_path / "a.md").write_text("# A\n\nA one.")
    (tmp_path / "ignored.txt").write_text("not a note")
    chunks = load_chunks(str(tmp_path))
    assert [(c.source, c.position) for c in chunks] == [("a.md", 0), ("b.md", 0), ("b.md", 1)]
    assert chunks[0].text == "A one."


def test_load_chunks_respects_the_chunk_size(tmp_path):
    (tmp_path / "a.md").write_text(" ".join(f"Sentence {i} is here." for i in range(40)))
    chunks = load_chunks(str(tmp_path), max_chars=80)
    assert len(chunks) > 1
    assert all(len(c.text) <= 80 for c in chunks)
    assert [c.position for c in chunks] == list(range(len(chunks)))


def test_a_missing_folder_is_an_error_not_an_empty_list(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_chunks(str(tmp_path / "nope"))
