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
