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
