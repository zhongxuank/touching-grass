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
