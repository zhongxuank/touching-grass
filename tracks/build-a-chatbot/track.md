---
title: Build a chatbot
builds_on: Build a RAG assistant
habits:
  - Keep state in session_state
  - Keep logic out of the page
  - Show the work
  - Fail visibly
  - Commit after each Lesson
lessons:
  - lessons/01-a-chat-page.md
  - lessons/02-streaming-and-settings.md
  - lessons/03-tools-in-the-chat.md
---
A Track Draft that builds on **Build a RAG assistant**, which itself builds on **Build an AI agent from scratch**. Finish those Tracks first: you open this one in the same project folder, so `agent/llm.py` (`ask()`), `agent/run.py` (`run_agent()`), `agent/tools.py` (with `search_notes`), `rag/`, `notes/`, `main.py` and `pyproject.toml` already exist. Nothing from them is taught again here. This Track puts a web chat page on top of that project.

You build the page with [Streamlit](https://streamlit.io), a Python library that turns a script into a web app, so there is no HTML, CSS or JavaScript to write. Three Lessons: a chat page that remembers the conversation, streaming replies with a sidebar for settings, and a chat that answers through your agent so it can search your notes, shows each tool call, and shows errors instead of crashing.

The page itself stays thin. Anything that is plain logic (building the prompt from the history, counting messages, finding the cited notes) lives in small functions under `chat/` that can be tested without Streamlit. The model calls go through one small dictionary, `BACKEND` in `chat/backend.py`, so a Check can swap in a fake model.

Every Check here runs without a key, the network or a browser. The page is tested with Streamlit's own `AppTest`, which runs your `app.py` in memory and lets a Check type a message and read what the page shows, with a fake model injected through `BACKEND`. Running the page yourself, with the **Run it** button, needs the Provider key you already set up and opens it in your browser. The finished project (the agents project, the RAG files and this Track's files) is in `reference/`.
