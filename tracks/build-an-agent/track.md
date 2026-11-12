---
title: Build an AI agent from scratch
habits:
  - Keep keys in .env
  - Type hints
  - Handle API errors and retries
  - Log what is sent to the model
  - Small functions
  - Commit after each Lesson
lessons:
  - lessons/01-call-an-llm.md
  - lessons/02-tool-calling.md
---
A Track Draft for a Learner who is comfortable with Python and SQL and has used LLMs through chat apps and coding agents, but has never written the API calls by hand. It builds a minimal AI agent in Python with the official SDKs (`anthropic`, `openai`) and `python-dotenv`. Later Lessons (LangChain, then RAG) are not written yet. The finished project is in `reference/`.

Providers: you need a key for only one of Claude, OpenAI or OpenRouter. Each Provider has its own file (`agent/llm_claude.py`, `agent/llm_openai.py`, `agent/llm_openrouter.py`), so the Steps for Providers you have no key for are read-only and your project still works with the one you chose.
