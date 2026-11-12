from rag.chunks import Hit
from rag.index import Index
from rag.embedder import embed
from rag.similarity import top_matches


def search(question: str, index: Index, top_k: int = 3, model=None) -> list[Hit]:
    query_vector = embed([question], model)[0]
    return [Hit(index.chunks[i], score) for i, score in top_matches(query_vector, index.vectors, top_k)]
