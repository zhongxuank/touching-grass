---
title: Streaming and settings
---
Your chat page works, but it feels slow: the answer appears all at once after a pause, while chat apps you know print it as it is written. This Lesson adds **streaming**, where the model sends its answer in small pieces and the page shows each piece as it arrives. Then you add a sidebar with the settings a chatbot needs: which Provider to use, which model that means, a button to start over, and a running count of how long the conversation has become.

Streaming is a Provider matter, so it is written the way the agents Track wrote `ask()`: one small file per Provider that knows that Provider's streaming calls, and one file that picks the right one. The page never learns which Provider is in use.

## Step: Stream from Claude

provider: claude
checks: test_stream_claude.py

`stream()` is a generator: a function that uses `yield` to hand back one piece at a time instead of returning once at the end. Whoever loops over it gets each piece as soon as it is yielded.

- `client.messages.stream(...)` takes the same arguments as the `messages.create(...)` you used in `agent/llm_claude.py`, but returns a stream object you use in a `with` block. The `with` closes the connection when you are done, even if the page stops reading early.
- `stream.text_stream` yields only the text pieces of the answer, a few characters at a time. `yield from` passes each one straight on.
- It reuses `MODEL` and `make_client` from `agent/llm_claude.py`, so the model and the key handling stay in one place.
- There is no `with_retries` here, unlike `ask()`. A retry after the first pieces were already shown would print the start of the answer twice, so a failed stream just raises and the page reports it (you add that in Lesson 3).

The Check passes a fake client, so it uses no key. Read it to see what shape of object your code expects from the real one.

```python file=agent/stream_claude.py
from collections.abc import Iterator

from agent.llm_claude import MODEL, make_client


def stream(
    prompt: str,
    *,
    client=None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> Iterator[str]:
    client = client or make_client()
    with client.messages.stream(
        model=MODEL,
        max_tokens=max_tokens,
        output_config={"effort": "low"},
        system=system,
        messages=[{"role": "user", "content": prompt}],
    ) as response:
        yield from response.text_stream
```

## Step: Stream from OpenAI

provider: openai
checks: test_stream_openai.py

OpenAI streams differently. You pass `stream=True` to the same `chat.completions.create` call and get back an iterator of **chunks**, each holding a small `delta` of the answer.

- `chunk.choices` can be empty (some chunks carry only bookkeeping), so the code checks it before reading `choices[0]`.
- `delta.content` is the new text, or `None` on chunks that carry no text, such as the first and last. Only a non-empty piece is yielded, so the page never receives `None`.

The rest matches the Claude file: same arguments, same `MODEL` and `make_client` from the Provider's `llm_` file, no retries.

```python file=agent/stream_openai.py
from collections.abc import Iterator

from agent.llm_openai import MODEL, make_client


def stream(
    prompt: str,
    *,
    client=None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> Iterator[str]:
    client = client or make_client()
    chunks = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        stream=True,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    for chunk in chunks:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
```

## Step: Stream from OpenRouter

provider: openrouter
checks: test_stream_openrouter.py

OpenRouter speaks the same protocol as OpenAI, with a different address and key, which your `llm_openrouter.py` already handles inside `make_client`. So this file is the OpenAI streaming code with the two imports changed.

```python file=agent/stream_openrouter.py
from collections.abc import Iterator

from agent.llm_openrouter import MODEL, make_client


def stream(
    prompt: str,
    *,
    client=None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> Iterator[str]:
    client = client or make_client()
    chunks = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        stream=True,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    for chunk in chunks:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
```

## Step: Pick the Provider's streamer

checks: test_stream.py

`stream_ask` is to streaming what `ask` in `agent/llm.py` is to a single answer: the one function the rest of your code calls, whichever Provider you use.

- `provider or choose_provider()` uses the Provider you pass in, or else the one from `LLM_PROVIDER` or the first key found, exactly as in the agents Track. This is where the page's sidebar will plug in.
- `load_streamer` imports `agent.stream_<name>` by name with `importlib`, only when it is needed. That is why a Learner with one key does not need the files of the other Providers: they are never imported.
- `stream_ask` is not itself a generator, so a missing key or an unknown Provider raises as soon as you call it, not on the first piece. It returns the Provider's generator.

```python file=agent/stream.py
import importlib
import logging
from collections.abc import Iterator
from types import ModuleType

from agent.llm import choose_provider

log = logging.getLogger("agent")


def load_streamer(name: str) -> ModuleType:
    return importlib.import_module(f"agent.stream_{name}")


def stream_ask(
    prompt: str,
    *,
    provider: str | None = None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> Iterator[str]:
    name = provider or choose_provider()
    log.info("stream provider=%s max_tokens=%d prompt=%r", name, max_tokens, prompt)
    return load_streamer(name).stream(prompt, system=system, max_tokens=max_tokens)
```

## Step: Settings as plain functions

checks: test_settings.py

The sidebar needs four answers: which Providers can I use, what model does each one run, how many messages are in the chat, and roughly how big is it. Each one is a small function with no Streamlit in it, in line with the **Keep logic out of the page** Habit, so the page only has to display them.

- `available_providers` returns the Providers that have a non-empty key. `load_env()` first makes sure your `.env` is read. It uses `PROVIDER_KEYS` from `agent/llm.py`, the same table `choose_provider` uses.
- `model_for` reads the `MODEL` name from the Provider's `llm_` file, so the sidebar always shows the model that is really called.
- `estimate_tokens` guesses the size of a text: about one token for every four characters of English. It is only an estimate, which is why the sidebar will say "about". A real count needs the Provider's own tokenizer, and a rough number is enough to see a conversation growing.
- `conversation_stats` adds it up for a whole history: the number of messages and the estimated tokens.

```python file=chat/settings.py
import os

from agent.config import load_env
from agent.llm import PROVIDER_KEYS, load_provider


def available_providers() -> list[str]:
    load_env()
    return [name for name, key in PROVIDER_KEYS.items() if os.environ.get(key, "").strip()]


def model_for(provider: str) -> str:
    return load_provider(provider).MODEL


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def conversation_stats(history: list[dict]) -> dict:
    tokens = sum(estimate_tokens(message["content"]) for message in history)
    return {"messages": len(history), "tokens": tokens}
```

## Step: Add a streaming reply to the backend

checks: test_stream_reply.py
place: Replace the whole file. `SYSTEM` and `reply` stay as they were; the `stream_ask` import, the `"stream"` entry in `BACKEND` and `stream_reply` are new

`stream_reply` is the streaming twin of `reply`. It builds the same prompt from the history and returns the iterator of text pieces instead of one string. It also takes the Provider the sidebar will choose and passes it on. `reply` stays: it is still the simplest way to get a whole answer, and the Checks from Lesson 1 still use it.

The new `"stream"` entry in `BACKEND` is the seam a Check swaps for a fake stream, the same as `"ask"`.

```python file=chat/backend.py
from collections.abc import Iterator

from agent.llm import ask
from agent.stream import stream_ask
from chat.history import build_prompt

SYSTEM = (
    "You are a friendly chatbot for the user's notes about AI agents. "
    "Use the conversation so far to understand follow-up questions. Answer briefly."
)

BACKEND = {"ask": ask, "stream": stream_ask}


def reply(history: list[dict], question: str) -> str:
    return BACKEND["ask"](build_prompt(history, question), system=SYSTEM)


def stream_reply(history: list[dict], question: str, provider: str | None = None) -> Iterator[str]:
    return BACKEND["stream"](build_prompt(history, question), provider=provider, system=SYSTEM)
```

## Step: Stream the answer into the page

checks: test_app_stream.py
place: Replace the whole file. The title, the history in `st.session_state`, the replay loop and the chat box stay; the import of `stream_reply` and `st.write_stream` replace `reply` and the spinner

`st.write_stream` takes an iterator of text pieces and writes them into the page as they arrive, with a blinking cursor. When the iterator ends, it returns the complete text as one string, which is what you store in the history. So one line does the whole job: show the answer live, and give it back for `add_message`.

The spinner is gone because the answer itself now shows that something is happening. Everything else is unchanged.

```python file=app.py
import streamlit as st

from chat.backend import stream_reply
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
        answer = st.write_stream(stream_reply(history, question))
    add_message(history, "user", question)
    add_message(history, "assistant", answer)
```

## Step: A sidebar with settings

checks: test_app_sidebar.py
run: uv run streamlit run app.py
habit: Commit after each Lesson
place: Replace the whole file. The title, the replay loop, the chat box and the streamed answer stay; the sidebar and the message count are new, and `stream_reply` now gets the chosen Provider

The sidebar is a second column of controls. `with st.sidebar:` puts everything inside it there, and the order of your code still matters, so the sidebar is built before the history is read.

- The selectbox lists the Providers that have a key and returns the one picked, or `None` if there are none. In that case the page warns the Learner instead of failing. The Provider picked is passed to `stream_reply`, which reaches `stream_ask` and loads that Provider's streamer.
- `model_for` shows the model behind it, as a caption.
- The **Clear chat** button returns `True` on the rerun it was clicked, so `st.session_state.history = []` empties the conversation right then. The `history` variable is taken after the sidebar for that reason: it must see the cleared list.
- `stats_box = st.empty()` reserves a spot in the sidebar that you fill in at the end of the script, once the new messages have been added. Filling it at the top would show the count from before the answer.

Press the Run it button and try it: switch Providers if you have more than one key, watch the answer stream in, watch the count grow, and press Clear chat.

Once it works, commit this Lesson so git records what it added. In the terminal, from your project folder, run `git add -A && git commit -m "Chatbot Lesson 2: streaming and settings"`. `.env` stays out because it is ignored. Pushing to a private GitHub repository is optional.

```python file=app.py
import streamlit as st

from chat.backend import stream_reply
from chat.history import add_message
from chat.settings import available_providers, conversation_stats, model_for

st.title("Notes chatbot")

if "history" not in st.session_state:
    st.session_state.history = []

with st.sidebar:
    st.header("Settings")
    provider = st.selectbox("Provider", available_providers())
    if provider:
        st.caption(f"Model: {model_for(provider)}")
    else:
        st.warning("No API key found. Fill in one key in .env.")
    if st.button("Clear chat"):
        st.session_state.history = []
    stats_box = st.empty()

history = st.session_state.history

for message in history:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

question = st.chat_input("Ask about your notes")
if question:
    with st.chat_message("user"):
        st.markdown(question)
    with st.chat_message("assistant"):
        answer = st.write_stream(stream_reply(history, question, provider=provider))
    add_message(history, "user", question)
    add_message(history, "assistant", answer)

stats = conversation_stats(history)
stats_box.caption(f"{stats['messages']} messages, about {stats['tokens']} tokens")
```

## Reflection

- Why does `stream()` not use `with_retries` the way `ask()` does? What would the Learner see if it did?
- The token count in the sidebar is a guess of one token per four characters. When would a wrong guess matter, and what would you use instead?
