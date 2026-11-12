---
title: A chat page
---
Until now you talked to your agent from the terminal, one question at a time, and it forgot everything between runs. This Lesson gives it a web page: a chat box, a scrolling conversation, and memory of what was said earlier.

The idea that makes Streamlit different from other web tools is the **rerun**. Every time the user does anything on the page (types a message, clicks a button), Streamlit runs your whole `app.py` again from the top. A normal variable is created fresh on each run, so it cannot remember anything. What survives reruns is `st.session_state`, a dictionary that belongs to one browser tab. Most of this Lesson is about that one fact.

You reuse the `ask()` function from the agents Track. Nothing about calling the model is new, only where the question comes from and where the answer goes.

## Step: Add Streamlit to the project

run: uv sync
place: Replace the whole file. The existing dependencies and the pytest settings stay as they were; `streamlit` is new

Streamlit is a normal Python package, so it goes in `pyproject.toml` with your other dependencies. `streamlit>=1.40` asks for a version recent enough to have the chat elements you use in this Track (`st.chat_input`, `st.chat_message`, `st.write_stream` and `st.status`).

Press the Run it button. `uv sync` reads `pyproject.toml` and installs what is missing into your project's `.venv`. It downloads Streamlit and a few dozen packages it depends on, so it may take a minute. Nothing else about your project changes.

```toml file=pyproject.toml
[project]
name = "mini-agent"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "anthropic>=0.40",
    "openai>=1.50",
    "python-dotenv>=1.0",
    "numpy>=1.26",
    "fastembed>=0.4",
    "streamlit>=1.40",
]

[tool.pytest.ini_options]
pythonpath = ["."]
```

## Step: Keep the conversation as plain data

checks: test_history.py
habit: Keep logic out of the page

A conversation is a list of messages, and a message is a small dictionary with a `role` (`"user"` or `"assistant"`) and its `content`. This file holds the two functions that work on that list. They know nothing about Streamlit, which is the point: this is the **Keep logic out of the page** Habit. Code that only handles data can be tested in a few lines, and the page stays a thin layer that shows it.

- `add_message` appends one message to the list. It changes the list it is given and returns nothing.
- `build_prompt` is how the model sees the conversation. `ask()` takes one string, not a list of messages, so you fold the earlier turns into it: each one becomes a line like `User: ...` or `Assistant: ...`, and the new question goes last, labelled as the latest question. `role.capitalize()` turns `"user"` into `"User"`. With no history the question is sent as it is.

Putting the history into the prompt as text is the simplest way to give a model memory. The model does not remember anything itself; each call starts blank, so you resend the conversation every time. That is also why long chats cost more and eventually hit the context window you read about in the RAG Track.

```python file=chat/history.py
def add_message(history: list[dict], role: str, content: str) -> None:
    history.append({"role": role, "content": content})


def build_prompt(history: list[dict], question: str) -> str:
    if not history:
        return question
    lines = [f"{message['role'].capitalize()}: {message['content']}" for message in history]
    return "Conversation so far:\n" + "\n".join(lines) + f"\n\nLatest question: {question}"
```

## Step: Wrap the model behind one dictionary

checks: test_backend.py

The page will call the model, but a Check cannot use a real model: it needs a key, costs money and gives different words every time. So the model calls go through one small dictionary instead of being imported straight into the page.

- `BACKEND` maps a name to the function that does the work. Right now it has one entry, `"ask"`, the real `ask()` from your agents Track. Later Lessons add `"stream"` and `"agent"`.
- `reply(history, question)` builds the prompt from the history and calls `BACKEND["ask"]` with it. It looks the function up each time it runs rather than saving it at import, so a Check can replace the entry with a fake and `reply` will use the fake.
- `SYSTEM` tells the model it is a chatbot for the Learner's notes and to use the conversation so far. It is passed as `system=` exactly like in the RAG Track.

A dictionary of functions you swap in tests is a simple form of **dependency injection**: the page depends on "something that answers", not on one particular model.

```python file=chat/backend.py
from agent.llm import ask
from chat.history import build_prompt

SYSTEM = (
    "You are a friendly chatbot for the user's notes about AI agents. "
    "Use the conversation so far to understand follow-up questions. Answer briefly."
)

BACKEND = {"ask": ask}


def reply(history: list[dict], question: str) -> str:
    return BACKEND["ask"](build_prompt(history, question), system=SYSTEM)
```

## Step: The first chat page

checks: test_app_page.py
run: uv run streamlit run app.py

This is the page. Read it top to bottom, because Streamlit does exactly that on every rerun.

- `st.title` writes a heading.
- `st.chat_input` draws the message box at the bottom of the page. It returns `None` until the user presses Enter, then returns the text they typed, for that one run only. `if question:` is therefore the code that handles a new message.
- `st.chat_message("user")` and `st.chat_message("assistant")` draw a speech bubble with the right avatar. Whatever you write inside the `with` block goes in the bubble. `st.markdown` writes text, and renders Markdown formatting in the model's answer.
- `st.spinner` shows "Thinking..." while the model works.

For now the page passes an empty list, `[]`, as the history, because it does not keep any yet.

Press the Run it button. Streamlit starts a local web server and opens the page in your browser (this needs the key in `.env`). Ask something, then ask "what did I just say?". Notice two problems. The bot cannot answer, and when you send the second message the first one disappears. Both come from the rerun: the page forgets everything not kept in `st.session_state`. You fix that in the next Step.

```python file=app.py
import streamlit as st

from chat.backend import reply

st.title("Notes chatbot")

question = st.chat_input("Ask about your notes")
if question:
    with st.chat_message("user"):
        st.markdown(question)
    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            answer = reply([], question)
        st.markdown(answer)
```

## Step: Remember the conversation

checks: test_app_history.py
habit: Keep state in session_state
place: Replace the whole file. The title, the chat box and the two chat bubbles stay; the history in `st.session_state` and the loop that redraws it are new

Now the page keeps the conversation in `st.session_state`, and redraws it at the top of every rerun.

- `if "history" not in st.session_state` creates the list only the first time. On later reruns it already exists, so the messages are kept.
- `history = st.session_state.history` gives a short name to the same list, not a copy. When `add_message` appends to `history`, it changes the list stored in the session state.
- The `for` loop replays the stored messages, one bubble each, before anything new is drawn. This is what makes old messages stay on the page after a rerun: Streamlit forgets the screen, your code redraws it from the data.
- When a question arrives, the page shows it, gets the reply with the history so far (not yet including this question, because `build_prompt` adds the question itself), and only then stores both messages.

This is the **Keep state in session_state** Habit. If something must survive a click, it goes in `st.session_state`; everything else is rebuilt from it.

You try it by hand in the next Step: the page remembers who said what, and a second question can refer to the first.

```python file=app.py
import streamlit as st

from chat.backend import reply
from chat.history import add_message

st.title("Notes chatbot")

if "history" not in st.session_state:
    st.session_state.history = []
history = st.session_state.history

for message in history:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

question = st.chat_input("Ask about your notes")
if question:
    with st.chat_message("user"):
        st.markdown(question)
    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            answer = reply(history, question)
        st.markdown(answer)
    add_message(history, "user", question)
    add_message(history, "assistant", answer)
```

## Step: Quiet Streamlit's first-run prompt

run: uv run streamlit run app.py
habit: Commit after each Lesson

The first time Streamlit starts it may stop in the terminal and ask for your email address, and it sends anonymous usage statistics. A small config file in your project turns the statistics off, which also skips the prompt. Streamlit reads `.streamlit/config.toml` from the folder you start it in. The folder name starts with a dot, so it is hidden in some file listings.

Press the Run it button and try the finished page: ask "What is an agent loop?", then "Why does it need a step limit?". The second question only makes sense with the first, so a good answer shows the history reaching the model. Press Ctrl+C in the terminal to stop the server when you are done.

Once it works, commit this Lesson so git records what it added. In the terminal, from your project folder, run `git add -A && git commit -m "Chatbot Lesson 1: a chat page"`. `.env` stays out because it is ignored. Pushing to a private GitHub repository is optional.

```toml file=.streamlit/config.toml
[browser]
gatherUsageStats = false
```

## Reflection

- Streamlit reruns the whole script on every click. What would happen to the conversation if you stored it in an ordinary variable instead of `st.session_state`?
- The model has no memory of its own. Where does the "memory" of this chatbot actually live, and what is the cost of resending it on every message?
