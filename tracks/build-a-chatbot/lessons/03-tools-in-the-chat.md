---
title: Tools in the chat
---
So far the chatbot answers from the model's memory and the conversation. Your project can do more: `run_agent()` from the agents Track lets the model call tools, and `search_notes` from the RAG Track lets it look things up in your notes. This Lesson routes the chat through the agent, so the bot can use your notes, and makes that visible. It also makes failures visible, because a chat page that crashes or freezes when a key is wrong is a bad page.

Three things are added, each as plain code first and page code second:

- a **recorder** that notes every tool call the agent makes, so the page can show it,
- a function that finds which notes an answer came from, so the page can cite them,
- a function that turns any exception into a sentence a person can act on.

`run_agent()` does not stream and does not report its tool calls, only the final text. You do not change it. The recorder watches the tools from outside.

## Step: Record the tool calls

checks: test_trace.py

`run_tool` in `agent/tools.py` finds a tool by name in the `TOOLS` dictionary and calls it. Every Provider's agent loop goes through it. So if you replace each function in `TOOLS` with a version that writes down what it was asked and what it returned, you see every tool call without touching the agent loops.

- `record_tool_calls` is a **context manager**: code in a `with record_tool_calls() as calls:` block runs with the recording switched on, and the `finally` always puts the original tools back, even if the agent raises. A recorder that stayed on would wrap the tools again on every message.
- `@contextmanager` turns a generator with one `yield` into a context manager. What is before the `yield` runs when the block starts, and what is after it runs when the block ends. The `calls` list is what the `with` statement gives back.
- The `wrapper` records the tool's name and arguments, calls the real function, and stores the result as text. If the function raises, it stores the error, marks `error` as `True` and raises again, so `run_tool` still turns it into an "Error: ..." message for the model exactly as before.

```python file=chat/trace.py
from contextlib import contextmanager

from agent.tools import TOOLS


@contextmanager
def record_tool_calls():
    calls: list[dict] = []
    originals = dict(TOOLS)

    def recording(name, func):
        def wrapper(**args):
            call = {"name": name, "args": args, "result": "", "error": False}
            calls.append(call)
            try:
                value = func(**args)
            except Exception as exc:
                call["result"] = f"Error: {exc}"
                call["error"] = True
                raise
            call["result"] = str(value)
            return value

        return wrapper

    for name, func in originals.items():
        TOOLS[name] = recording(name, func)
    try:
        yield calls
    finally:
        TOOLS.clear()
        TOOLS.update(originals)
```

## Step: Find the notes that were used

checks: test_sources.py

`search_notes` returns passages that each start with their file name in square brackets, such as `[agent-loop.md]`. That is what you set up in the RAG Track so answers could be traced to a note. `find_sources` reads the recorded calls and pulls those file names out, so the page can show where an answer came from, the same **Cite sources** idea as before but checked by your code instead of trusted from the model's wording.

- It looks only at calls to `search_notes` that did not fail.
- `re.compile(r"\[([^\[\]]+\.md)\]")` matches a `.md` file name inside square brackets. The parentheses make the file name the thing `findall` returns.
- Names are added once, in the order first found.

```python file=chat/sources.py
import re

NOTE_NAME = re.compile(r"\[([^\[\]]+\.md)\]")


def find_sources(calls: list[dict]) -> list[str]:
    found: list[str] = []
    for call in calls:
        if call["name"] != "search_notes" or call["error"]:
            continue
        for name in NOTE_NAME.findall(call["result"]):
            if name not in found:
                found.append(name)
    return found
```

## Step: Turn errors into messages

checks: test_errors.py
habit: Fail visibly

Things go wrong in a chat: the key is missing or wrong, the Provider is busy, the network drops. Left alone, Streamlit shows a long Python traceback, which is useful to you but not to a person using the page. `describe_error` turns an exception into one plain sentence that says what to do.

- Provider errors from the Anthropic and OpenAI libraries carry a `status_code`. `getattr(exc, "status_code", None)` reads it if it exists and gives `None` for any other exception, so one function handles both.
- 401 and 403 mean the key was rejected. 429 means too many requests, which is the same error your retry code from the agents Track already treats as temporary, so it says to wait.
- Everything else, including the "key is missing" message from `get_key`, falls through to a generic sentence that still includes the original message. The error is not hidden: it is shown, only in words.

This is the **Fail visibly** Habit. An error that is swallowed is worse than a crash, so the answer to a failure is a visible message with a next step, never silence.

```python file=chat/errors.py
def describe_error(exc: Exception) -> str:
    status = getattr(exc, "status_code", None)
    if status in (401, 403):
        return "The Provider rejected your API key. Check the key in .env and the Provider chosen in the sidebar."
    if status == 429:
        return "The Provider says you are sending too many requests. Wait a moment and try again."
    return f"Something went wrong: {exc}"
```

## Step: Let messages carry extra details

checks: test_history_extras.py
place: Replace the whole file. `build_prompt` keeps its behaviour for normal messages; `add_message` takes extra details, and `build_prompt` now skips error messages

A message needs to carry more than a role and text now. An answer can have tool calls and sources to show again when the page redraws, and a failed turn is stored as a message marked `error` so it stays on the page.

- `**extra` collects any other keyword arguments, such as `calls=[...]` or `error=True`, and `**extra` inside the dictionary adds them to the message. Old calls, like `add_message(history, "user", "hi")`, work as before.
- `build_prompt` leaves error messages out of the prompt. The model should not read "The Provider rejected your API key" as something it said earlier. If nothing is left after leaving them out, the question is sent on its own, as when there is no history.

```python file=chat/history.py
def add_message(history: list[dict], role: str, content: str, **extra) -> None:
    history.append({"role": role, "content": content, **extra})


def build_prompt(history: list[dict], question: str) -> str:
    lines = [
        f"{message['role'].capitalize()}: {message['content']}"
        for message in history
        if not message.get("error")
    ]
    if not lines:
        return question
    return "Conversation so far:\n" + "\n".join(lines) + f"\n\nLatest question: {question}"
```

## Step: Answer through the agent

checks: test_agent_reply.py
place: Replace the whole file. `SYSTEM`, `reply` and `stream_reply` stay as they were; the agent imports, `AgentReply`, the `"agent"` entry in `BACKEND` and `agent_reply` are new

`agent_reply` is the third way to answer, next to `reply` (one whole answer) and `stream_reply` (streamed). It sends the same history-and-question prompt to `run_agent`, so the model may call `search_notes`, `add` or `get_time`, and it records the calls while it does.

- `AgentReply` is a small dataclass with the three things the page shows: the `text`, the tool `calls` and the note `sources`.
- `with record_tool_calls() as calls:` switches the recorder on around the agent call only. `list(calls)` copies the list, so what the page keeps does not change later.
- `BACKEND["agent"]` is `run_agent`, a seam for Checks as with the other two. `provider` goes through to `run_agent`, which already accepts it.
- Nothing here catches an exception. If the agent fails it fails out of `agent_reply`, and the page decides what to show. The function that fails is not the right place to decide that.

```python file=chat/backend.py
from collections.abc import Iterator
from dataclasses import dataclass

from agent.llm import ask
from agent.run import run_agent
from agent.stream import stream_ask
from chat.history import build_prompt
from chat.sources import find_sources
from chat.trace import record_tool_calls

SYSTEM = (
    "You are a friendly chatbot for the user's notes about AI agents. "
    "Use the conversation so far to understand follow-up questions. Answer briefly."
)

BACKEND = {"ask": ask, "stream": stream_ask, "agent": run_agent}


@dataclass
class AgentReply:
    text: str
    calls: list[dict]
    sources: list[str]


def reply(history: list[dict], question: str) -> str:
    return BACKEND["ask"](build_prompt(history, question), system=SYSTEM)


def stream_reply(history: list[dict], question: str, provider: str | None = None) -> Iterator[str]:
    return BACKEND["stream"](build_prompt(history, question), provider=provider, system=SYSTEM)


def agent_reply(history: list[dict], question: str, provider: str | None = None) -> AgentReply:
    with record_tool_calls() as calls:
        text = BACKEND["agent"](build_prompt(history, question), provider=provider)
    return AgentReply(text, list(calls), find_sources(calls))
```

## Step: Show each tool call

checks: test_app_tools.py
habit: Show the work
place: Replace the whole file. The title, the sidebar, the chat box, `st.session_state` and the streamed answer stay; `show_calls`, the "use my notes" toggle and the agent branch are new

Now the page uses the agent, and shows what it did.

- `show_calls` draws one tool call: its name and arguments, and its result in a code block. A function in the page file is fine for this, since it only displays.
- `st.status("Thinking...")` draws a box that stays open while the agent works. Inside it you write the tool calls; `status.update(...)` then sets its label to a summary and closes it (`expanded=False`) so it takes little space, and the Learner can click it open. The calls appear when the agent finishes, not while it works, because `run_agent` returns only at the end.
- The sidebar gets a toggle. On, the question goes through `agent_reply`. Off, it is streamed as in Lesson 2, which is fast and cheap but cannot search your notes. Having both lets you see the difference for the same question.
- Replies that used tools store their `calls` in the message, and the replay loop shows them again in an `st.expander` so they are not lost on the next rerun.

This is the **Show the work** Habit. An answer built from tool results is easier to trust, and to debug, when you can see which tools ran and what they returned.

```python file=app.py
import streamlit as st

from chat.backend import agent_reply, stream_reply
from chat.history import add_message
from chat.settings import available_providers, conversation_stats, model_for


def show_calls(calls: list[dict]) -> None:
    for call in calls:
        st.markdown(f"**{call['name']}** `{call['args']}`")
        st.code(call["result"], language=None)


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
    use_tools = st.toggle("Use my notes and tools", value=True)
    if st.button("Clear chat"):
        st.session_state.history = []
    stats_box = st.empty()

history = st.session_state.history

for message in history:
    with st.chat_message(message["role"]):
        if message.get("calls"):
            with st.expander(f"Tool calls ({len(message['calls'])})"):
                show_calls(message["calls"])
        st.markdown(message["content"])

question = st.chat_input("Ask about your notes")
if question:
    with st.chat_message("user"):
        st.markdown(question)
    extra = {}
    with st.chat_message("assistant"):
        if use_tools:
            with st.status("Thinking...") as status:
                result = agent_reply(history, question, provider=provider)
                show_calls(result.calls)
                status.update(label=f"Used {len(result.calls)} tool call(s)", state="complete", expanded=False)
            st.markdown(result.text)
            answer = result.text
            extra = {"calls": result.calls}
        else:
            answer = st.write_stream(stream_reply(history, question, provider=provider))
    add_message(history, "user", question)
    add_message(history, "assistant", answer, **extra)

stats = conversation_stats(history)
stats_box.caption(f"{stats['messages']} messages, about {stats['tokens']} tokens")
```

## Step: Show sources and errors

checks: test_app_errors.py
run: uv run streamlit run app.py
habit: Commit after each Lesson
place: Replace the whole file. Everything stays; `show_sources`, the `try`/`except` around the answer, and showing error messages and sources when the history is redrawn are new

The last step makes the page honest about where an answer came from and what went wrong.

- `show_sources` writes a caption such as `Sources: agent-loop.md, tool-calling.md` under an answer that used your notes, from the file names `find_sources` found. It writes nothing when there are none, so a chat answer from the model's own knowledge is not dressed up with sources.
- The `try` block now wraps everything that can fail: finding the Provider, calling the model, reading the stream. `except Exception as exc:` catches any of them, shows `describe_error(exc)` with `st.error` (a red box), and keeps going. The page never crashes and never leaves the Learner looking at a blank bubble.
- The failed turn is still stored, as a message marked `error=True`. The replay loop draws such a message with `st.error` again, and `build_prompt` leaves it out of later prompts, so after you fix the key and ask again the conversation continues normally.
- Sources are stored in the message with the calls, so they are shown again on the next rerun.

Press the Run it button and try it: ask "What ends the agent loop?" and open the status box to see the `search_notes` call and the note it found, then ask "What is 17 plus 25?" to see the `add` tool. Ask a question your notes do not cover, and compare it with the toggle off. To see the error path, rename your key in `.env` to something wrong, restart, and send a message.

Once it works, commit this Lesson so git records what it added. In the terminal, from your project folder, run `git add -A && git commit -m "Chatbot Lesson 3: tools in the chat"`. `.env` stays out because it is ignored. Pushing to a private GitHub repository is optional.

```python file=app.py
import streamlit as st

from chat.backend import agent_reply, stream_reply
from chat.errors import describe_error
from chat.history import add_message
from chat.settings import available_providers, conversation_stats, model_for


def show_calls(calls: list[dict]) -> None:
    for call in calls:
        st.markdown(f"**{call['name']}** `{call['args']}`")
        st.code(call["result"], language=None)


def show_sources(sources: list[str]) -> None:
    if sources:
        st.caption("Sources: " + ", ".join(sources))


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
    use_tools = st.toggle("Use my notes and tools", value=True)
    if st.button("Clear chat"):
        st.session_state.history = []
    stats_box = st.empty()

history = st.session_state.history

for message in history:
    with st.chat_message(message["role"]):
        if message.get("error"):
            st.error(message["content"])
            continue
        if message.get("calls"):
            with st.expander(f"Tool calls ({len(message['calls'])})"):
                show_calls(message["calls"])
        st.markdown(message["content"])
        show_sources(message.get("sources", []))

question = st.chat_input("Ask about your notes")
if question:
    with st.chat_message("user"):
        st.markdown(question)
    extra = {}
    with st.chat_message("assistant"):
        try:
            if use_tools:
                with st.status("Thinking...") as status:
                    result = agent_reply(history, question, provider=provider)
                    show_calls(result.calls)
                    status.update(label=f"Used {len(result.calls)} tool call(s)", state="complete", expanded=False)
                st.markdown(result.text)
                show_sources(result.sources)
                answer = result.text
                extra = {"calls": result.calls, "sources": result.sources}
            else:
                answer = st.write_stream(stream_reply(history, question, provider=provider))
        except Exception as exc:
            answer = describe_error(exc)
            st.error(answer)
            extra = {"error": True}
    add_message(history, "user", question)
    add_message(history, "assistant", answer, **extra)

stats = conversation_stats(history)
stats_box.caption(f"{stats['messages']} messages, about {stats['tokens']} tokens")
```

## Reflection

- `record_tool_calls` puts the original tools back in a `finally` block. What would go wrong on the second message if it did not?
- A failed turn is stored in the history but left out of the next prompt. Why is it right to keep it on the page but hide it from the model?
