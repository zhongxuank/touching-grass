---
title: Embeddings
---
Keyword search compares spelling. Embeddings compare meaning. An **embedding model** turns a piece of text into a list of numbers called a **vector**, in a way that texts about the same thing end up with vectors that point in nearly the same direction. "The model forgets old messages" and "the oldest messages are dropped" share almost no words, but their vectors are close.

To search, you embed every chunk once, embed the question, and pick the chunks whose vectors are closest to the question's. "Closest" is measured by **cosine similarity**: the angle between two vectors. If both vectors have length 1, it is simply their dot product (multiply matching numbers, add them up). 1 means the same direction, and values near 0 mean unrelated.

The model here is `BAAI/bge-small-en-v1.5`, run on your own computer by the `fastembed` library. It is small (about 130 MB), needs no API key, and does not send your notes anywhere. The first time it runs it downloads itself, so that run is slow once.

Embedding every chunk is the slow, expensive part, so you also save the results to disk and reuse them.

## Step: Add the embedding dependencies

run: uv sync
place: Replace the whole file. The project name, the three existing dependencies and the pytest setting stay as they were; `numpy` and `fastembed` are new

Two new libraries. `fastembed` runs the embedding model on your CPU. `numpy` does fast maths on whole lists of numbers at once; `fastembed` needs it anyway, and you use it for the similarity maths. Everything else in the file stays as the agents Track left it: the SDKs, `python-dotenv` and the pytest setting that lets Checks import your code.

After you type it, press the Run it button (`uv sync`), which installs the new libraries into the project's virtual environment.

```toml file=pyproject.toml
[project]
name = "mini-agent"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "anthropic>=0.40",
    "openai>=1.50",
    "python-dotenv>=1.0",
    "numpy>=1.26",
    "fastembed>=0.4",
]

[tool.pytest.ini_options]
pythonpath = ["."]
```

## Step: Keep the model and index out of git

place: Replace the whole file. The three existing lines stay; `.rag/` is new

`.rag/` is a folder this Lesson creates for two things: the downloaded embedding model and your saved index. Both can be rebuilt any time and the model is large, so git should never record them. Listing the folder here, before it exists, means it can never be committed by accident.

```gitignore file=.gitignore
.venv/
__pycache__/
.env
.rag/
```

## Step: Turn text into vectors

checks: test_embedder.py

`embed` takes a list of texts and returns one vector per text, stacked into a single numpy array (a **matrix** with one row per text).

- `load_model` creates the `fastembed` model. The `fastembed` import is inside the function on purpose: it is slow to import, so nothing pays for it until a real embedding is needed. `@lru_cache` remembers the result, so the model loads once per run, not once per question. `cache_dir=".rag/models"` stores the downloaded model inside `.rag/`, which you just ignored in git.
- `embed(texts, model=None)` uses a model you pass in, or the real one if you pass none. Any object with an `embed(texts)` method that yields vectors works as the model. That is the **seam** that lets a Check hand in a tiny fake model, so the Checks never download anything.
- `np.array(list(model.embed(texts)), dtype=np.float32)` collects the vectors into one matrix of 32-bit decimals (half the memory of the default, and plenty precise).
- The last lines scale each row to length 1. `np.linalg.norm(..., axis=1, keepdims=True)` measures each row's length, and dividing by it shrinks the row to length 1. `np.maximum(norms, 1e-12)` stops a division by zero for an all-zero vector. After this, a plain dot product between two rows is their cosine similarity.

```python file=rag/embedder.py
from functools import lru_cache

import numpy as np

MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache(maxsize=1)
def load_model():
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=MODEL_NAME, cache_dir=".rag/models")


def embed(texts: list[str], model=None) -> np.ndarray:
    if not texts:
        return np.empty((0, 0), dtype=np.float32)
    if model is None:
        model = load_model()
    vectors = np.array(list(model.embed(texts)), dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(norms, 1e-12)
```

## Step: Find the closest vectors

checks: test_similarity.py

`top_matches` takes the question's vector and the matrix of chunk vectors, and returns the `top_k` best matches as `(row number, score)` pairs.

`vectors @ query_vector` is numpy's matrix-times-vector: it takes the dot product of every row with the question in one go, so you get one score per chunk. Because every vector has length 1, these scores are cosine similarities. `np.argsort(scores)` returns the row numbers ordered from lowest score to highest, `[::-1]` reverses that so the best is first, and `[:top_k]` keeps the first few. `int(...)` and `float(...)` turn numpy's number types into plain Python ones, which print and save cleanly.

```python file=rag/similarity.py
import numpy as np


def top_matches(query_vector: np.ndarray, vectors: np.ndarray, top_k: int = 3) -> list[tuple[int, float]]:
    if len(vectors) == 0:
        return []
    scores = vectors @ query_vector
    best = np.argsort(scores)[::-1][:top_k]
    return [(int(i), float(scores[i])) for i in best]
```

## Step: Embed every chunk into an index

checks: test_index.py

An **index** is the searchable form of your notes: the chunks plus a matrix with one vector for each, in the same order, so row `i` of `vectors` is the embedding of `chunks[i]`. `build_index` makes one by embedding the text of every chunk in a single call.

The `model` argument is passed straight through to `embed`, so a Check can hand in its fake model here too.

```python file=rag/index.py
from dataclasses import dataclass

import numpy as np

from rag.chunks import Chunk
from rag.embedder import embed


@dataclass
class Index:
    chunks: list[Chunk]
    vectors: np.ndarray


def build_index(chunks: list[Chunk], model=None) -> Index:
    return Index(chunks, embed([chunk.text for chunk in chunks], model))
```

## Step: Save the index and reuse it

checks: test_store.py
habit: Cache what is expensive

Embedding is the slow part, and your notes rarely change. So save the index and only rebuild it when the notes change. This is the **Cache what is expensive** Habit: do slow work once, keep the result, and know when it has gone stale.

- `save_index` writes two files into the folder. `np.savez` stores the vectors in `index.npz`, numpy's compact format for arrays. The chunks go in `chunks.json`; `asdict(chunk)` turns each dataclass into a plain dictionary that `json` can write. `mkdir(parents=True, exist_ok=True)` creates the folder if needed.
- `load_index` reads them back and rebuilds the `Chunk` objects (`Chunk(**c)` unpacks each dictionary into the constructor). If either file is missing it returns `None`, which means "nothing saved yet".
- `get_index` is the function you will actually call. It loads the chunks from the notes folder every time (cheap), then looks at the saved index. If the saved chunks are exactly equal to the current ones, the saved vectors are still right and it returns them. Otherwise it builds a new index and saves it. Edit a note and the next run notices and re-embeds; leave the notes alone and it skips the model completely.

If you ever switch to a different embedding model, delete the `.rag/` folder, because the saved vectors came from the old one.

```python file=rag/store.py
import json
from dataclasses import asdict
from pathlib import Path

import numpy as np

from rag.chunks import Chunk
from rag.index import Index, build_index
from rag.notes import load_chunks

INDEX_FOLDER = ".rag"


def save_index(index: Index, folder: str = INDEX_FOLDER) -> None:
    folder_path = Path(folder)
    folder_path.mkdir(parents=True, exist_ok=True)
    np.savez(folder_path / "index.npz", vectors=index.vectors)
    chunks = [asdict(chunk) for chunk in index.chunks]
    (folder_path / "chunks.json").write_text(json.dumps(chunks, indent=2), encoding="utf-8")


def load_index(folder: str = INDEX_FOLDER) -> Index | None:
    vectors_file = Path(folder) / "index.npz"
    chunks_file = Path(folder) / "chunks.json"
    if not vectors_file.exists() or not chunks_file.exists():
        return None
    chunks = [Chunk(**c) for c in json.loads(chunks_file.read_text(encoding="utf-8"))]
    return Index(chunks, np.load(vectors_file)["vectors"])


def get_index(notes_folder: str = "notes", index_folder: str = INDEX_FOLDER, model=None) -> Index:
    chunks = load_chunks(notes_folder)
    saved = load_index(index_folder)
    if saved is not None and saved.chunks == chunks:
        return saved
    index = build_index(chunks, model)
    save_index(index, index_folder)
    return index
```

## Step: Search by meaning

checks: test_search.py

`search` is the embedding counterpart of `keyword_search`, and it returns the same `Hit` objects, so the rest of the project can use either. It embeds the question (as a list of one text, so `[0]` takes the single row back out), asks `top_matches` for the closest chunk rows, and wraps each as a `Hit` with its chunk and its score.

```python file=rag/search.py
from rag.chunks import Hit
from rag.index import Index
from rag.embedder import embed
from rag.similarity import top_matches


def search(question: str, index: Index, top_k: int = 3, model=None) -> list[Hit]:
    query_vector = embed([question], model)[0]
    return [Hit(index.chunks[i], score) for i, score in top_matches(query_vector, index.vectors, top_k)]
```

## Step: Compare keyword and embedding search

checks: test_compare.py
run: uv run python compare.py "Why does the assistant forget things said long ago?"
habit: Commit after each Lesson

This script asks the same question both ways and prints the results one after the other. `get_index` builds the index the first time (this is when the model downloads, and `.rag/` appears) and loads it from disk afterwards. `main` takes an optional `model` so a Check can inject the fake one.

Press the Run it button. The first run is slow. Then read the two lists: keyword search finds nothing, because none of the question's words appear in the note, while embedding search returns scored chunks, and the one from `context-window.md` about a lengthy conversation filling the window should be near the top. Look at the scores too. Try a question that nothing in the notes answers, like `"What is the capital of France?"`, and notice that embedding search still returns its closest chunks, with lower scores. Lesson 3 uses that.

Once it works, commit this Lesson so git records what it added. In the terminal, from your project folder, run `git add -A && git commit -m "RAG Lesson 2: embeddings"`. `.rag/` and `.env` stay out because they are ignored.

```python file=compare.py
import sys

from rag.chunks import format_hit
from rag.keyword import keyword_search
from rag.search import search
from rag.store import get_index


def show(hits: list) -> None:
    if not hits:
        print("  no matches")
    for hit in hits:
        print("  " + format_hit(hit))


def main(args: list[str], model=None) -> None:
    question = " ".join(args) or "Why does the assistant forget things said long ago?"
    index = get_index(model=model)
    print(f"Question: {question}\n")
    print("Keyword search:")
    show(keyword_search(question, index.chunks))
    print("Embedding search:")
    show(search(question, index, model=model))


if __name__ == "__main__":
    main(sys.argv[1:])
```

## Reflection

- Why are the vectors scaled to length 1, and what does that let you do with a plain dot product?
- `get_index` compares the saved chunks with the current ones before reusing the saved vectors. What would go wrong if it just trusted whatever was in `.rag/`?
