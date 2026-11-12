---
title: Answer with sources
---
Retrieval finds passages. This Lesson turns them into answers. You put the best chunks into a prompt, ask the model to answer from them and name the notes it used, and refuse to answer when nothing in the notes is close enough. Then you give your agent from the previous Track a `search_notes` tool, so it decides for itself when to look something up, and you measure how good your retrieval is instead of guessing.

This is the "generation" half of retrieval-augmented generation. You reuse the `ask()` function you wrote in the agents Track; nothing about calling the model is new, only what you put in the prompt.

## Step: Build a prompt from the chunks

checks: test_prompt.py
habit: Cite sources

Two things go to the model: a **system prompt** with the rules, and a **user prompt** holding the evidence and the question.

- `SYSTEM` tells the model three rules: use only the sources given, cite the file name in square brackets after each claim, and say it does not know when the sources do not contain the answer. Without the last rule a model happily fills gaps from its own memory, which defeats the point of using your notes.
- `build_prompt` labels each chunk with its file name in square brackets (`[agent-loop.md]`) and puts the question last. The label is what the model copies when it cites, and it is what lets you check an answer against the note it came from.

This is the **Cite sources** Habit. An answer you cannot trace back to a note is an answer you cannot trust or fix.

```python file=rag/prompt.py
from rag.chunks import Hit

SYSTEM = (
    "You answer questions using only the sources you are given. "
    "Each source is labelled with its file name in square brackets. "
    "After each claim, cite the file name in square brackets, like [agent-loop.md]. "
    "If the sources do not contain the answer, say you don't know."
)


def build_prompt(question: str, hits: list[Hit]) -> str:
    sources = "\n\n".join(f"[{hit.chunk.source}]\n{hit.chunk.text}" for hit in hits)
    return f"Sources:\n\n{sources}\n\nQuestion: {question}"
```

## Step: Answer, or say you don't know

checks: test_answer.py

`answer_question` is the whole RAG pipeline in one function: search, then decide, then ask.

- It gets the index (`get_index()` if you did not pass one) and searches for the top chunks.
- `best` is the top score. In Lesson 2 you saw that embedding search always returns its nearest chunks, even for a question the notes do not cover. So only chunks with `score >= min_score` count as `relevant`. If none do, the function returns `NO_ANSWER` without calling the model at all. That is correct, since it has nothing to base an answer on, and it is free.
- Otherwise it calls `ask_fn(prompt, system=SYSTEM)`. `ask_fn` defaults to the real `ask()`, but a Check passes in a fake one, so no key is needed. `list(dict.fromkeys(...))` removes repeated file names while keeping their order, giving the list of sources used.
- It returns an `Answer`, a small dataclass holding the text, the sources and the best score, so a caller can show all three.

`MIN_SCORE` is a starting guess, not a fact. Different embedding models spread their scores differently, so the right cut-off has to be found by looking at real scores. You do that in the next Step: ask a question the notes answer and one they do not, and move the number between the two. A threshold you never tested is a bug waiting to happen.

```python file=rag/answer.py
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
```

## Step: Ask your notes a question

checks: test_ask_notes.py
run: uv run python ask_notes.py "What happens when a conversation fills the context window?"

This script runs the pipeline from the command line and prints the answer, the sources used and the best score. `main` passes any extra keyword arguments (`**kwargs`) straight to `answer_question`, so a Check can inject a fake `ask_fn` and `model`. `{', '.join(result.sources) or 'none'}` joins the file names with commas, or prints `none` when the list is empty.

Press the Run it button. This one calls your Provider, so it needs the key in `.env`. You should get a short answer that cites `context-window.md`. Then run it with an off-topic question, such as `uv run python ask_notes.py "What is the capital of France?"`, and you should get the "I don't know" reply with no model call. Compare the two best scores printed. If an on-topic question is refused or an off-topic one is answered, change `MIN_SCORE` in `rag/answer.py` to a number between the two scores.

```python file=ask_notes.py
import sys

from rag.answer import answer_question


def main(args: list[str], **kwargs) -> None:
    question = " ".join(args) or "What happens when a conversation fills the context window?"
    result = answer_question(question, **kwargs)
    print(result.text)
    print(f"\nSources: {', '.join(result.sources) or 'none'} (best score {result.best_score:.2f})")


if __name__ == "__main__":
    main(sys.argv[1:])
```

## Step: Give the agent a search_notes tool

checks: test_search_notes_tool.py
place: Replace the whole file. `get_time`, `add` and `run_tool` stay as they were; the two new imports, `search_notes` and its entry in `TOOLS` are new

So far you decide when to search. A **tool** lets the agent decide: when a question looks like something the notes might answer, the model asks for `search_notes` the same way it asks for `add`.

`search_notes(query)` runs the same search as before and returns the passages as one string, each starting with its file name in square brackets, so the model can cite them. Only chunks above `MIN_SCORE` are returned, and when none are, the tool says so in plain words, so the model can tell the user instead of guessing. It takes just a `query` string because the model only fills in what the tool description asks for.

`TOOLS` is the dictionary `run_tool` uses to find a function by name, so adding `"search_notes": search_notes` there is what makes the agent loop able to run it. Nothing in the agent loops or Provider files changes: they run whatever `TOOLS` holds.

```python file=agent/tools.py
from datetime import datetime, timezone

from rag.answer import MIN_SCORE
from rag.search import search
from rag.store import get_index


def get_time() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def add(a: float, b: float) -> float:
    return a + b


def search_notes(query: str) -> str:
    hits = [hit for hit in search(query, get_index()) if hit.score >= MIN_SCORE]
    if not hits:
        return "No relevant notes found."
    return "\n\n".join(f"[{hit.chunk.source}] {hit.chunk.text}" for hit in hits)


TOOLS = {"get_time": get_time, "add": add, "search_notes": search_notes}


def run_tool(name: str, args: dict) -> str:
    func = TOOLS.get(name)
    if func is None:
        return f"Error: unknown tool {name}"
    try:
        return str(func(**args))
    except Exception as exc:
        return f"Error: {exc}"
```

## Step: Describe search_notes to the model

checks: test_search_tool_spec.py
place: Replace the whole file. The `get_time` and `add` specs stay as they were; the `search_notes` spec is new

The model cannot see your Python, so it gets a **tool schema** for `search_notes`, written in the same neutral shape as the other two. The `description` is how the model decides when to use the tool: it says what the tool searches and what it returns, and when to reach for it. The `parameters` say there is one required string, `query`. Describe the argument as a short search phrase, because the model will usually pass a rephrased version of the user's question.

The Check also requires every spec's arguments to match the real function's arguments. That is why `search_notes` has only `query`.

```python file=agent/tool_specs.py
TOOL_SPECS = [
    {
        "name": "get_time",
        "description": "Get the current date and time in UTC.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "add",
        "description": "Add two numbers and return the sum.",
        "parameters": {
            "type": "object",
            "properties": {
                "a": {"type": "number", "description": "The first number."},
                "b": {"type": "number", "description": "The second number."},
            },
            "required": ["a", "b"],
        },
    },
    {
        "name": "search_notes",
        "description": (
            "Search the user's personal notes and return the most relevant passages, "
            "each starting with the note file it came from in square brackets. "
            "Use it for any question the notes might answer, and cite the file names."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "A short phrase describing what to look up."},
            },
            "required": ["query"],
        },
    },
]
```

## Step: Measure retrieval

checks: test_evaluate.py
run: uv run python -m rag.evaluate
habit: Measure retrieval

How do you know retrieval works? Right now you have looked at three or four examples. An **evaluation** replaces looking with measuring: a fixed list of questions, each with the note that should answer it, and a score for how often search finds that note.

- `EVAL_CASES` holds `(question, expected note)` pairs. The first five use plain words from the notes. The last one is the "forget" question that keyword search could not answer. Add your own pairs as you write more notes.
- `hit_rate(find, cases)` takes any function `find(question)` that returns hits, so the same measurement works for both kinds of search. For each case it checks whether the expected file is among the sources found, and it returns the fraction found: 1.0 means every question found its note.
- `main` builds the index and prints the hit rate for keyword search and for embedding search, keeping only the top 2 chunks each. `python -m rag.evaluate` runs this file as a module, which is what lets `if __name__ == "__main__"` work for a file inside the `rag` folder.

This is the **Measure retrieval** Habit. Whenever you change the chunk size, the embedding model or the threshold, run this and see whether the number went up or down, instead of trusting a feeling. A handful of cases is a tiny sample, so treat it as a smoke test, not a benchmark.

```python file=rag/evaluate.py
from rag.keyword import keyword_search
from rag.search import search
from rag.store import get_index

EVAL_CASES = [
    ("What ends the agent loop?", "agent-loop.md"),
    ("Why does a loop need a step limit?", "agent-loop.md"),
    ("How does the model decide which tool fits?", "tool-calling.md"),
    ("Does the model run the tools itself?", "tool-calling.md"),
    ("What is a token?", "context-window.md"),
    ("Why does the assistant forget things said long ago?", "context-window.md"),
]


def hit_rate(find, cases: list[tuple[str, str]] = EVAL_CASES) -> float:
    found = 0
    for question, expected in cases:
        sources = [hit.chunk.source for hit in find(question)]
        if expected in sources:
            found += 1
    return found / len(cases)


def main() -> None:
    index = get_index()
    keyword = hit_rate(lambda q: keyword_search(q, index.chunks, top_k=2))
    embedding = hit_rate(lambda q: search(q, index, top_k=2))
    print(f"Questions: {len(EVAL_CASES)}")
    print(f"Keyword search hit rate:   {keyword:.0%}")
    print(f"Embedding search hit rate: {embedding:.0%}")


if __name__ == "__main__":
    main()
```

## Step: Let your agent use the notes

habit: Commit after each Lesson
run: uv run python main.py
place: Replace the whole file. The logging setup and the `run_agent` call stay; the question now comes from the command line and defaults to one about your notes

`main.py` from the agents Track asked a fixed question. Now it takes the question from the command line (`sys.argv[1:]`, as in your other scripts) and defaults to one your notes answer. Nothing else changes: `run_agent` already sends all of `TOOL_SPECS` to the model, so the agent can now see `search_notes` and call it.

Press the Run it button. Because logging is on, you will see the request, then the model calling `search_notes` with a query it wrote itself, then the final answer built from the passages it got back. Try a question the notes do not cover, like `uv run python main.py "What is the capital of France?"`, and see whether the agent searches, finds nothing and says so, or answers from memory. That choice is the difference between a RAG tool and a RAG pipeline: the pipeline always retrieves, the tool leaves the decision to the model.

Once it works, commit this Lesson so git records what it added. In the terminal, from your project folder, run `git add -A && git commit -m "RAG Lesson 3: answer with sources"`. `.env` and `.rag/` stay out because they are ignored.

```python file=main.py
import logging
import sys

from agent.run import run_agent

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) or "Using my notes, why does a model lose track of the start of a long conversation?"
    print(run_agent(question))
```

## Reflection

- `answer_question` returns "I don't know" without calling the model when no chunk is above the threshold. What would happen to a question outside the notes if it did not?
- The agent can choose whether to call `search_notes`, while `answer_question` always searches. When would you want each one?
