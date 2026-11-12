import logging
from dataclasses import dataclass

from agent.llm import ask
from rag.prompt import SYSTEM, build_prompt
from rag.search import search
from rag.store import get_index

log = logging.getLogger("agent")

MIN_SCORE = 0.55
NO_ANSWER = "I don't know. Nothing in my notes answers that."


@dataclass
class Answer:
    text: str
    sources: list[str]
    best_score: float


def answer_question(
    question: str,
    *,
    index=None,
    model=None,
    ask_fn=ask,
    min_score: float = MIN_SCORE,
    top_k: int = 3,
) -> Answer:
    if index is None:
        index = get_index(model=model)
    hits = search(question, index, top_k=top_k, model=model)
    best = hits[0].score if hits else 0.0
    relevant = [hit for hit in hits if hit.score >= min_score]
    log.info("question=%r best_score=%.2f relevant=%d", question, best, len(relevant))
    if not relevant:
        return Answer(NO_ANSWER, [], best)
    text = ask_fn(build_prompt(question, relevant), system=SYSTEM)
    sources = list(dict.fromkeys(hit.chunk.source for hit in relevant))
    return Answer(text, sources, best)
