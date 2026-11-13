import re
import shutil
from pathlib import Path

import pytest

from rag.convert import clean, convert_all, pdf_text

# The PDFs that ship with the Track: the same ones the Learner copies into sources/.
BUNDLED = Path(__file__).resolve().parent.parent / "assets" / "pdfs"


@pytest.fixture
def converted(tmp_path):
    sources = tmp_path / "sources"
    shutil.copytree(BUNDLED, sources)
    notes = tmp_path / "notes"
    written = convert_all(str(sources), str(notes))
    return {path.name: path.read_text(encoding="utf-8") for path in written}


def test_pdf_text_reads_the_words_out_of_a_pdf():
    text = pdf_text(BUNDLED / "agent-loop.pdf")
    assert isinstance(text, str)
    assert "agent" in text.lower() and "loop" in text.lower()


def test_each_pdf_becomes_a_markdown_note_named_after_it(converted):
    assert set(converted) == {"agent-loop.md", "tool-calling.md", "context-window.md"}


def test_a_note_starts_with_a_title_line_and_has_real_content(converted):
    for name, text in converted.items():
        assert text.startswith("# "), name
        assert len(text.split()) > 500, name


def test_notes_have_one_line_per_paragraph_separated_by_blank_lines(converted):
    for name, text in converted.items():
        blocks = text.strip().split("\n\n")
        assert len(blocks) >= 8, name
        assert all("\n" not in block for block in blocks), name


def test_notes_have_no_hyphen_breaks_or_page_footers(converted):
    for name, text in converted.items():
        assert not re.search(r"\w-\s", text), name
        assert not re.search(r"^Page \d+$", text, re.M), name


def test_clean_joins_hyphenated_lines_and_wrapped_paragraphs():
    raw = "My title\n\nA heading\nThis text was wrapped by the instruc-\ntion of the page\nand ends here.\n\nPage 1"
    assert clean(raw) == "# My title\n\n## A heading\n\nThis text was wrapped by the instruction of the page and ends here.\n"


def test_a_missing_sources_folder_is_an_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        convert_all(str(tmp_path / "nope"), str(tmp_path / "notes"))
