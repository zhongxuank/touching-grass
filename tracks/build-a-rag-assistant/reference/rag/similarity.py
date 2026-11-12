import numpy as np


def top_matches(query_vector: np.ndarray, vectors: np.ndarray, top_k: int = 3) -> list[tuple[int, float]]:
    if len(vectors) == 0:
        return []
    scores = vectors @ query_vector
    best = np.argsort(scores)[::-1][:top_k]
    return [(int(i), float(scores[i])) for i in best]
