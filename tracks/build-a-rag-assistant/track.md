---
title: Build a RAG assistant
builds_on: Build an AI agent from scratch
habits:
  - Keep chunks small
  - Cite sources
  - Measure retrieval
  - Cache what is expensive
  - Commit after each Lesson
lessons:
  - lessons/01-retrieval-by-hand.md
  - lessons/02-embeddings.md
  - lessons/03-answer-with-sources.md
---
A Track Draft that builds on **Build an AI agent from scratch**. Finish that Track first: you open this one in the same project folder, so `agent/llm.py` (`ask()`), `agent/run.py` (`run_agent()`), `agent/tools.py`, `agent/tool_specs.py`, `main.py` and `pyproject.toml` already exist. Nothing from it is taught again here. This Track extends it.

RAG (retrieval-augmented generation) means: before the model answers, your code finds the few passages of your own documents that matter and puts them in the prompt, so the answer comes from your text instead of from the model's memory. You build it in three Lessons: turn three PDF articles into notes and find passages by keywords with no AI, find them by meaning with embeddings from a small local model, then answer with sources and give your agent a `search_notes` tool.

The embeddings come from `BAAI/bge-small-en-v1.5`, a small model that runs on your own computer through the `fastembed` library, so searching needs no API key. The first time it runs it downloads about 130 MB. Answering with `ask()` and running the agent still need the Provider key you already set up. Every Check here uses a tiny fake embedder and a fake `ask()`, so Checks download nothing and cost nothing. The finished project (the agents project plus this Track's files) is in `reference/`. The three PDFs ship with the Track (`assets/pdfs/`); a button in Lesson 1 copies them into your project, and `authoring/make_pdfs.py` rebuilds them from `authoring/source/` if you want to change the articles.
