import numpy as np

from rag.similarity import top_matches

VECTORS = np.array([[1.0, 0.0], [0.0, 1.0], [0.6, 0.8]])


def test_the_closest_vector_comes_first_with_its_score():
    matches = top_matches(np.array([1.0, 0.0]), VECTORS, top_k=3)
    assert [row for row, _ in matches] == [0, 2, 1]
    assert abs(matches[0][1] - 1.0) < 1e-6
    assert all(isinstance(row, int) and isinstance(score, float) for row, score in matches)


def test_top_k_limits_the_results():
    assert len(top_matches(np.array([0.0, 1.0]), VECTORS, top_k=2)) == 2


def test_no_vectors_means_no_matches():
    assert top_matches(np.array([1.0, 0.0]), np.empty((0, 2))) == []
