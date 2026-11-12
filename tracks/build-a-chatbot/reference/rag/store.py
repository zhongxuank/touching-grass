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
