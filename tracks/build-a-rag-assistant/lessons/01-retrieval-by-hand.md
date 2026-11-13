---
title: Retrieval by hand
---
Retrieval-augmented generation starts with one plain problem: you have some documents, someone asks a question, and you have to find the few passages that answer it. In this Lesson you solve that with no AI at all. You turn three PDF articles into Markdown notes, load the notes, cut them into **chunks**, and rank the chunks by how many of the question's words they contain.

Real documents rarely arrive as tidy text files. They are PDFs, web pages and exports, and the first job of any RAG system is getting the text out of them. So you start there: a button copies three PDFs into your project (they are articles about how LLM agents work), and you write the code that reads them and saves clean notes.

Doing the search by hand first matters. Every later improvement in this Track (embeddings, a threshold, an evaluation) is an answer to something you will see go wrong here.

A **chunk** is one small piece of a document, kept together with where it came from: the file name (its **source**) and its **position** in that file. Search works on chunks, not whole files, because a prompt has limited room and a short passage is easier to match than a long file. The articles are a few pages each, so each one becomes a dozen or more chunks.

Your project already holds the agent from the previous Track. This Lesson adds a `sources/` folder with the PDFs, a `notes/` folder with the text made from them, and a `rag/` folder with the new code. Nothing in `agent/` changes yet.

## Step: Add pypdf and copy the articles

copy: assets/pdfs -> sources
run: uv sync
place: Replace the whole file. The project name, the three existing dependencies and the pytest setting stay as they were; `pypdf` is new

Two jobs in one Step, and neither needs much typing.

First, the files. Press the **Copy the files** button in this panel. It copies the three PDFs (`agent-loop.pdf`, `tool-calling.pdf` and `context-window.pdf`) from the Track into a new `sources/` folder in your project. It never overwrites a file you already have, so pressing it twice is safe. In a real project this folder would hold your own documents, and you would drop them in yourself.

Second, the library. `pypdf` is a pure Python library that reads PDF files and pulls the text out of them. Type the new `pyproject.toml` below, with `pypdf>=5` added to the dependencies. Everything else in the file stays as the agents Track left it: the SDKs, `python-dotenv` and the pytest setting that lets Checks import your code. Then press the Run it button (`uv sync`), which installs `pypdf` into the project's virtual environment.

```toml file=pyproject.toml
[project]
name = "mini-agent"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "anthropic>=0.40",
    "openai>=1.50",
    "python-dotenv>=1.0",
    "pypdf>=5",
]

[tool.pytest.ini_options]
pythonpath = ["."]
```

## Step: Turn the PDFs into notes

checks: test_convert.py
run: uv run python -m rag.convert

A PDF is made for printing, not for reading by a program. It describes where each line of text sits on a page, so the text you get back is full of artefacts of the layout. This file reads every PDF in `sources/` and writes a clean Markdown **note** for each one into `notes/`.

- `pdf_text` opens a PDF with `PdfReader` and asks each page for its text. `extraction_mode="layout"` keeps the gaps between paragraphs as blank lines, which the plain mode throws away. The pages are joined with a blank line.
- `clean` does the tidying, in three moves. First, a regular expression joins words the PDF broke across two lines with a hyphen (`instruc-` at the end of a line, `tion` at the start of the next becomes `instruction`). Second, it splits the text into blocks at blank lines and joins the wrapped lines of each block into one line, because a paragraph is one idea, not one line of a page. Third, it drops the page footer (`Page 2`) and marks headings.
- `is_heading` is a guess, and a good example of cleaning real documents: a line that is short and does not end in punctuation is probably a heading. The first heading is the article's title and becomes `# Title`; the others become `## Heading`. In the next Steps the chunking code skips lines that start with `#`, so a heading never counts as a passage.
- `convert_all` does this for every `.pdf` in the folder and writes `notes/<name>.md`, named after the PDF. It raises a clear error if the `sources/` folder is missing, in the same spirit as the notes loader you write soon. `Path.mkdir(exist_ok=True)` makes `notes/` if it is not there yet.
- `main` prints each file it wrote. `if __name__ == "__main__"` lets you run the file as a module, and lets a Check import it without running it.

Cleaning text is never perfect. A real hyphenated word, such as "open-source", would be joined wrongly if it happened to break at the hyphen, and a heading that ends with a full stop would not be spotted. For learning documents like these, a simple rule that mostly works is the right trade. In a real project you would look at the notes the code writes and adjust the rules to fit your documents.

Press the Run it button. It should print three lines, one per note. Then open `notes/agent-loop.md` and read it: a title, a few headings, and paragraphs separated by blank lines. This is the text the rest of the Lesson searches.

```python file=rag/convert.py
import re
from pathlib import Path

from pypdf import PdfReader


def pdf_text(path: Path) -> str:
    reader = PdfReader(path)
    return "\n\n".join(page.extract_text(extraction_mode="layout") for page in reader.pages)


def is_heading(line: str) -> bool:
    return len(line) < 60 and not line.endswith((".", ",", ":", ";", "!", "?"))


def clean(text: str) -> str:
    text = re.sub(r"(\w)-[ \t]*\n[ \t]*(\w)", r"\1\2", text)
    pieces = []
    for block in re.split(r"\n\s*\n", text):
        lines = [" ".join(line.split()) for line in block.splitlines() if line.strip()]
        if not lines or re.fullmatch(r"Page \d+", lines[0]):
            continue
        if is_heading(lines[0]):
            level = "#" if not pieces else "##"
            pieces.append(f"{level} {lines.pop(0)}")
        if lines:
            pieces.append(" ".join(lines))
    return "\n\n".join(pieces) + "\n"


def convert_all(sources: str = "sources", notes: str = "notes") -> list[Path]:
    folder = Path(sources)
    if not folder.is_dir():
        raise FileNotFoundError(f"No sources folder at {folder}. Copy the PDFs there first.")
    Path(notes).mkdir(exist_ok=True)
    written = []
    for pdf in sorted(folder.glob("*.pdf")):
        target = Path(notes) / f"{pdf.stem}.md"
        target.write_text(clean(pdf_text(pdf)), encoding="utf-8")
        written.append(target)
    return written


def main() -> None:
    for path in convert_all():
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
```

## Step: Cut text into chunks

checks: test_chunks.py
habit: Keep chunks small

This file defines the two small data types the whole Track passes around, and the function that cuts text into chunks.

- `Chunk` is one piece of a note: `source` (the file name), `position` (its number within that file, starting at 0) and `text`. `@dataclass(frozen=True)` makes Python write the boilerplate for you (the constructor and `==`), and `frozen` means a chunk can never be changed after it is made, which keeps it safe to pass around.
- `Hit` is a chunk that a search found, with its `score`: a number saying how well it matches the question. You use it from the next Steps on.
- `split_text` does the cutting. It splits the text on blank lines (`"\n\n"`) into paragraphs, and `" ".join(paragraph.split())` tidies the whitespace by turning any run of spaces and newlines into a single space. It skips empty paragraphs and every line that starts with `#`, the title and headings your converter wrote, because a heading on its own answers nothing.
- A long paragraph is split further, at sentence ends, so no chunk is longer than `max_chars` characters. The articles you converted have paragraphs of a few hundred characters, and some are a little over the default of 500, so you will see a few of them cut in two. `re.split(r"(?<=[.!?])\s+", paragraph)` cuts after a `.`, `!` or `?` that is followed by whitespace. The loop packs sentences into `current` until adding the next one would go over the limit, then starts a new chunk.
- `format_hit` turns a `Hit` into one printable line. You use it in the scripts that show search results.

This is the **Keep chunks small** Habit. A small chunk matches one idea, and the model later gets only the relevant passage, not a whole file. With articles this size the habit matters: a whole article is about a thousand words, and only a paragraph of it answers any one question. A chunk that is too large hides the answer in noise, and one that is too small loses the context around it.

```python file=rag/chunks.py
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    source: str
    position: int
    text: str


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    score: float


def split_text(text: str, max_chars: int = 500) -> list[str]:
    pieces = []
    for paragraph in text.split("\n\n"):
        paragraph = " ".join(paragraph.split())
        if not paragraph or paragraph.startswith("#"):
            continue
        current = ""
        for sentence in re.split(r"(?<=[.!?])\s+", paragraph):
            if current and len(current) + 1 + len(sentence) > max_chars:
                pieces.append(current)
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        pieces.append(current)
    return pieces


def format_hit(hit: Hit) -> str:
    return f"{hit.score:.2f}  {hit.chunk.source} #{hit.chunk.position}: {hit.chunk.text[:70]}"
```

## Step: Load the notes

checks: test_notes.py

`load_chunks` reads every `.md` file in a folder and returns all their chunks in one list. Here the folder is `notes/`, the Markdown your converter wrote.

`Path(folder).glob("*.md")` lists the Markdown files, and `sorted(...)` puts them in a fixed order, so the chunks come out the same every time (the saved index in the next Lesson relies on that). `read_text(encoding="utf-8")` reads a file as text. `enumerate(texts)` counts the paragraphs from 0, which becomes each chunk's `position`. `path.name` is just the file name, like `agent-loop.md`, which is what you will later cite as the source.

If the folder does not exist, the function raises a clear error instead of quietly returning nothing, so a typo shows up straight away. The default folder `"notes"` is relative to where you run Python, which is your project folder.

```python file=rag/notes.py
from pathlib import Path

from rag.chunks import Chunk, split_text


def load_chunks(folder: str = "notes", max_chars: int = 500) -> list[Chunk]:
    notes = Path(folder)
    if not notes.is_dir():
        raise FileNotFoundError(f"No notes folder at {notes}. Create it and add .md files.")
    chunks = []
    for path in sorted(notes.glob("*.md")):
        texts = split_text(path.read_text(encoding="utf-8"), max_chars)
        chunks.extend(Chunk(path.name, position, text) for position, text in enumerate(texts))
    return chunks
```

## Step: Rank chunks by shared words

checks: test_keyword.py

The simplest search there is. `words` turns text into a set of lowercase words: `re.findall(r"[a-z0-9]+", text.lower())` pulls out runs of letters and digits, and the set drops repeats. Words like "the" and "is" are in `STOPWORDS` and left out, because they appear everywhere and say nothing about the topic.

`keyword_search` gives each chunk a score: the share of the question's words that also appear in the chunk (`wanted & words(chunk.text)` is the set overlap). It sorts best first with `sort(..., reverse=True)`, keeps the top `top_k`, and drops any chunk with a score of 0, so a question with no matching words returns an empty list instead of a pretend answer.

Notice what this cannot do. It only matches identical words: "tools" does not match "tool", and a question that says "forget" will never find a note that says "no longer knows". That gap is why Lesson 2 exists.

```python file=rag/keyword.py
import re

from rag.chunks import Chunk, Hit

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from",
    "how", "i", "in", "is", "it", "of", "on", "or", "the", "to", "what", "when", "which",
    "who", "why", "with", "you",
}


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS}


def keyword_search(question: str, chunks: list[Chunk], top_k: int = 3) -> list[Hit]:
    wanted = words(question)
    hits = []
    for chunk in chunks:
        score = len(wanted & words(chunk.text)) / len(wanted) if wanted else 0.0
        hits.append(Hit(chunk, score))
    hits.sort(key=lambda hit: hit.score, reverse=True)
    return [hit for hit in hits[:top_k] if hit.score > 0]
```

## Step: Try keyword search

checks: test_try_keywords.py
run: uv run python try_keywords.py "How does the agent loop end?"
habit: Commit after each Lesson

This script puts the pieces together so you can see retrieval working with no AI. It loads the chunks, prints how many there are, runs `keyword_search`, and prints each hit with `format_hit` (score, file, position, start of the text). `sys.argv[1:]` holds the words typed after the file name, and `or` falls back to a default question. As in the agents Track, `main()` plus `if __name__ == "__main__"` lets a Check import the file without running it.

Press the Run it button. The first line says how many chunks the three notes made (about 45, more or fewer if you changed `max_chars`). Below it you should see the chunks about the agent loop at the top, each with its score, its file and its position. Then try a few of your own questions: `"Why does the assistant forget things said long ago?"` finds nothing at all, although the context window note answers it. Keep that question: Lesson 2 fixes it.

Once it works, commit this Lesson so git records what it added. In the terminal, from your project folder, run `git add -A && git commit -m "RAG Lesson 1: retrieval by hand"`. `git add -A` stages every change, and `.env` stays out because it is ignored. Both `sources/` and `notes/` are committed on purpose: the PDFs are your input and the notes are small text files you can read in a diff, so a teammate who clones the project can search straight away. In a project with big or private documents you would add `sources/` to `.gitignore` instead, and rebuild `notes/` by running the converter. Pushing to a private GitHub repo is optional.

```python file=try_keywords.py
import sys

from rag.chunks import format_hit
from rag.keyword import keyword_search
from rag.notes import load_chunks


def main(args: list[str]) -> None:
    question = " ".join(args) or "How does the agent loop end?"
    chunks = load_chunks()
    print(f"Loaded {len(chunks)} chunks from notes/")
    hits = keyword_search(question, chunks)
    print(f"Question: {question}")
    if not hits:
        print("  no matching words in any chunk")
    for hit in hits:
        print("  " + format_hit(hit))


if __name__ == "__main__":
    main(sys.argv[1:])
```

## Reflection

- Why search over small chunks with a source and a position, instead of whole files?
- Your converter guessed which lines were headings and which were page furniture. What would go wrong with a document it did not expect, and how would you notice?
- Keyword search found nothing for a question the notes do answer. What exactly is it missing, and what would a search need to understand to get it right?
