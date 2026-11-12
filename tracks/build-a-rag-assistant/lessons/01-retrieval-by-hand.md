---
title: Retrieval by hand
---
Retrieval-augmented generation starts with one plain problem: you have some text, someone asks a question, and you have to find the few passages that answer it. In this Lesson you solve that with no AI at all. You write a small set of notes, load them, cut them into **chunks**, and rank the chunks by how many of the question's words they contain.

Doing it by hand first matters. Every later improvement in this Track (embeddings, a threshold, an evaluation) is an answer to something you will see go wrong here.

A **chunk** is one small piece of a document, kept together with where it came from: the file name (its **source**) and its **position** in that file. Search works on chunks, not whole files, because a prompt has limited room and a short passage is easier to match than a long file.

Your project already holds the agent from the previous Track. This Lesson adds a `notes/` folder with the text to search and a `rag/` folder with the new code. Nothing in `agent/` changes yet.

## Step: Write a note about the agent loop

You need something to search. These three notes are about how LLM agents work, so you can check the answers yourself: each question you ask later has one note that clearly answers it. Type this one into a new `notes/` folder.

Each note is a few short paragraphs separated by a blank line. The blank lines matter: the code you write in a few Steps treats each paragraph as one chunk. The `#` title line is only a heading for you as a reader, and the chunking code skips it.

```markdown file=notes/agent-loop.md
# The agent loop

An AI agent is a loop around a language model, and this cycle is called the agent loop. Each round, the program sends the conversation so far to the model and reads what comes back.

If the reply is a request to use a tool, the program runs that tool, adds the result to the conversation, and goes round again. If the reply is plain text, the loop ends and that text is the final answer.

Every loop needs a step limit. A confused model can keep asking for tools forever, so the program counts the rounds and stops with an error after a fixed number, such as five.
```

## Step: Write a note about tool calling

The second note. Same shape: a title, then short paragraphs separated by blank lines. Type it into `notes/` next to the first.

```markdown file=notes/tool-calling.md
# Tool calling

A language model only produces text. It cannot read a clock, query a database or do reliable arithmetic by itself. Tool calling lets it ask your program to do those jobs for it.

You describe each tool with a name, a plain-English description and a schema for its arguments. The description matters most, because it is how the model decides whether a tool fits the question.

The model never runs a tool. It only replies with the tool name and the arguments, and your code decides whether and how to run it. The result goes back to the model as a new message tagged with the id of the request it answers.
```

## Step: Write a note about the context window

The third note. It is the one the later Lessons use to show where keyword search falls short, so type it as it is: notice that it says "lengthy conversation" and "no longer knows", not "forget".

```markdown file=notes/context-window.md
# The context window

A model can only read a limited amount of text at once. That limit is the context window, and it is measured in tokens, where a token is about three quarters of a word.

The prompt, the conversation history, the tool results and the reply all share the window. When a lengthy conversation fills it, the oldest messages must be dropped or summarised, so the model no longer knows what happened at the start.

Retrieval is one way to cope. Instead of pasting every document into the prompt, the program searches for the few passages that matter and sends only those.
```

## Step: Cut text into chunks

checks: test_chunks.py
habit: Keep chunks small

This file defines the two small data types the whole Track passes around, and the function that cuts text into chunks.

- `Chunk` is one piece of a note: `source` (the file name), `position` (its number within that file, starting at 0) and `text`. `@dataclass(frozen=True)` makes Python write the boilerplate for you (the constructor and `==`), and `frozen` means a chunk can never be changed after it is made, which keeps it safe to pass around.
- `Hit` is a chunk that a search found, with its `score`: a number saying how well it matches the question. You use it from the next Steps on.
- `split_text` does the cutting. It splits the text on blank lines (`"\n\n"`) into paragraphs, and `" ".join(paragraph.split())` tidies the whitespace by turning any run of spaces and newlines into a single space. It skips empty paragraphs and the `#` title line, because a title on its own answers nothing.
- A long paragraph is split further, at sentence ends, so no chunk is longer than `max_chars` characters. `re.split(r"(?<=[.!?])\s+", paragraph)` cuts after a `.`, `!` or `?` that is followed by whitespace. The loop packs sentences into `current` until adding the next one would go over the limit, then starts a new chunk.
- `format_hit` turns a `Hit` into one printable line. You use it in the scripts that show search results.

This is the **Keep chunks small** Habit. A small chunk matches one idea, and the model later gets only the relevant passage, not a whole file. A chunk that is too large hides the answer in noise, and one that is too small loses the context around it.

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

`load_chunks` reads every `.md` file in a folder and returns all their chunks in one list.

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

Press the Run it button. You should see the chunks about the agent loop at the top. Then try a few of your own questions: `"Why does the assistant forget things said long ago?"` finds nothing at all, although the context window note answers it. Keep that question: Lesson 2 fixes it.

Once it works, commit this Lesson so git records what it added. In the terminal, from your project folder, run `git add -A && git commit -m "RAG Lesson 1: retrieval by hand"`. `git add -A` stages every change, and `.env` stays out because it is ignored. Pushing to a private GitHub repo is optional.

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
- Keyword search found nothing for a question the notes do answer. What exactly is it missing, and what would a search need to understand to get it right?
