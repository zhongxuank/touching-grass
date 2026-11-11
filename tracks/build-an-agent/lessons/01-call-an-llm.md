---
title: Call an LLM
---
In this Lesson you set up a Python project, make your first call to an LLM with the official SDK, and then wrap that call in a small function the rest of the Track reuses.

An LLM API is a web service. You send it a list of messages and it sends back a reply. The SDKs (`anthropic`, `openai`) are libraries that do the HTTP for you.

You need a key for **one** Provider: Claude, OpenAI or OpenRouter. The three Provider Steps show the same call side by side. Each one writes its own file (`agent/llm_claude.py`, `agent/llm_openai.py`, `agent/llm_openrouter.py`) so they never overwrite each other. Type only the Step for your Provider and read the other two to see what differs. A later Step adds one shared module that picks whichever Provider you set up.

## Step: Set up the project

uv manages Python projects. `pyproject.toml` names the project, the Python version, and its dependencies: `anthropic` and `openai` are the official SDKs (OpenRouter is used through the `openai` SDK, you only change its base URL), and `python-dotenv` reads a `.env` file. The `[tool.pytest.ini_options]` part tells pytest to import your code from the project folder. Run `uv sync` in the terminal afterwards to install everything.

```toml file=pyproject.toml
[project]
name = "mini-agent"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "anthropic>=0.40",
    "openai>=1.50",
    "python-dotenv>=1.0",
]

[tool.pytest.ini_options]
pythonpath = ["."]
```

## Step: Ignore files that should not be committed

`.venv/` is the virtual environment uv creates, `__pycache__/` holds compiled Python, and `.env` will hold your API keys. A key committed to git is effectively public and has to be revoked, so list `.env` before you create it.

```gitignore file=.gitignore
.venv/
__pycache__/
.env
```

## Step: List the keys in .env.example

`.env.example` is a template you commit: it names the settings the project needs, with empty values. Copy it to `.env` (`cp .env.example .env`) and paste in the key for one Provider. `.env` stays private because the previous Step ignored it, while `.env.example` shows anyone who clones the project what to fill in. `LLM_PROVIDER` is optional: when you have several keys, it says which Provider to use.

```text file=.env.example
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=
# Optional: claude, openai or openrouter. Defaults to the first key found.
LLM_PROVIDER=
```

## Step: Read keys from .env

checks: test_config.py
habit: Keep keys in .env

`load_dotenv()` reads the `.env` file and puts each line into the process environment, where `os.environ` can see it. `get_key` is the only place in the project that reads a key. It loads the file, looks the name up, and raises a clear error if the key is missing or empty, so a forgotten key fails with an instruction instead of a confusing error from the API later. The `-> str` after the parameters is a type hint: it says the function returns a string.

```python file=agent/config.py
import os

from dotenv import load_dotenv


def load_env() -> None:
    load_dotenv()


def get_key(name: str) -> str:
    load_env()
    key = os.environ.get(name, "").strip()
    if not key:
        raise RuntimeError(f"{name} is missing. Copy .env.example to .env and fill it in.")
    return key
```

## Step: Call Claude

provider: claude
checks: test_llm_claude.py

Some words you will meet in every LLM API:

- **messages**: the conversation so far, a list of dictionaries. Each has a **role**: `"user"` for what you say and `"assistant"` for what the model said. Here we send one user message.
- **system prompt**: instructions that set the model's behaviour for the whole conversation, such as "answer briefly". Anthropic takes it as a separate `system=` argument.
- **max tokens**: a cap on the length of the reply. A token is roughly three quarters of a word. A small cap keeps experiments cheap.
- **content blocks**: Anthropic's reply is not a plain string but a list of blocks. A text answer is a block with `type == "text"`; a thinking block has a different type. In the next Lesson, a request to use a tool will be a different kind of block.

`claude-haiku-5-5` is Anthropic's small, cheap model, which is plenty for learning. It can **think** before it answers: it works through the problem in hidden reasoning and then writes the reply, and those thinking tokens count toward `max_tokens` along with the answer. Two settings keep that under control. `output_config={"effort": "low"}` tells the model to think only a little (effort controls how much it thinks). And `max_tokens=1024` leaves plenty of room, so a short answer is never cut off because thinking used the budget up. The reply may therefore start with a thinking block, so `response_text` keeps only blocks whose `type` is `"text"` and skips the rest. (Do not set `temperature`, `top_p`, `top_k` or `budget_tokens` for this model.) `ask` takes an optional `client`. If you pass none it makes a real one, but a test can pass a fake object instead and never touch the network. `max_retries=0` turns off the SDK's built-in retries so that the retry code you write in a later Step is the only one.

```python file=agent/llm_claude.py
from anthropic import Anthropic

from agent.config import get_key

MODEL = "claude-haiku-5-5"


def make_client() -> Anthropic:
    return Anthropic(api_key=get_key("ANTHROPIC_API_KEY"), max_retries=0)


def response_text(response) -> str:
    return "".join(block.text for block in response.content if block.type == "text")


def ask(
    prompt: str,
    *,
    client: Anthropic | None = None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> str:
    client = client or make_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        output_config={"effort": "low"},
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return response_text(response)
```

## Step: Call OpenAI

provider: openai
checks: test_llm_openai.py

Same idea, different shape. Read it next to the Claude Step and spot the differences:

- OpenAI has no separate `system=` argument. The system prompt is the first message, with role `"system"`.
- The reply is `response.choices[0].message.content`, a plain string, not a list of content blocks. (`choices` can hold several alternative answers. We always take the first.)
- The cheap model here is `gpt-4o-mini`.

The `make_client` and `ask` names and arguments match the Claude file on purpose, so the rest of the project can call either one the same way.

```python file=agent/llm_openai.py
from openai import OpenAI

from agent.config import get_key

MODEL = "gpt-4o-mini"


def make_client() -> OpenAI:
    return OpenAI(api_key=get_key("OPENAI_API_KEY"), max_retries=0)


def response_text(response) -> str:
    return response.choices[0].message.content or ""


def ask(
    prompt: str,
    *,
    client: OpenAI | None = None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> str:
    client = client or make_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return response_text(response)
```

## Step: Call OpenRouter

provider: openrouter
checks: test_llm_openrouter.py

OpenRouter is one account that routes to many models. It copies OpenAI's API on purpose, so you use the `openai` SDK and change only two things: the `base_url`, which says where to send requests, and the model name, which now includes the maker, like `openai/gpt-4o-mini`. Everything else is the same as the OpenAI Step. The file is separate so that a Learner with only an OpenRouter key has everything they need.

```python file=agent/llm_openrouter.py
from openai import OpenAI

from agent.config import get_key

MODEL = "openai/gpt-4o-mini"
BASE_URL = "https://openrouter.ai/api/v1"


def make_client() -> OpenAI:
    return OpenAI(api_key=get_key("OPENROUTER_API_KEY"), base_url=BASE_URL, max_retries=0)


def response_text(response) -> str:
    return response.choices[0].message.content or ""


def ask(
    prompt: str,
    *,
    client: OpenAI | None = None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> str:
    client = client or make_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return response_text(response)
```

## Step: Retry when the API hiccups

checks: test_retry.py
habit: Handle API errors and retries

Real API calls fail for reasons that are not your fault: the network drops, you hit a rate limit (HTTP 429), or the service is briefly overloaded (5xx). Retrying after a short wait usually works. A bad key (401) or a bad request (400) will never work, so retrying those just wastes time.

`is_retryable` decides which errors deserve another try. Both SDKs put the HTTP status on the error as `status_code`, and name their network errors `APIConnectionError` and `APITimeoutError`, so one function covers every Provider without importing either SDK. `with_retries` takes any function, calls it, and on a retryable error waits and tries again, doubling the wait each time. The optional `sleep` argument lets a test replace the waiting with something instant.

```python file=agent/retry.py
import logging
import time
from typing import Callable, TypeVar

T = TypeVar("T")
log = logging.getLogger("agent")

RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504, 529}
RETRYABLE_NAMES = {"APIConnectionError", "APITimeoutError"}


def is_retryable(exc: Exception) -> bool:
    if getattr(exc, "status_code", None) in RETRYABLE_STATUS:
        return True
    return type(exc).__name__ in RETRYABLE_NAMES


def with_retries(
    call: Callable[[], T],
    *,
    attempts: int = 3,
    delay: float = 1.0,
    sleep: Callable[[float], None] | None = None,
) -> T:
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except Exception as exc:
            if attempt == attempts or not is_retryable(exc):
                raise
            wait = delay * 2 ** (attempt - 1)
            log.warning("API call failed (%s), retrying in %.1fs", exc, wait)
            (sleep or time.sleep)(wait)
    raise RuntimeError("unreachable")
```

## Step: One ask() for every Provider

checks: test_llm.py
habit: Log what is sent to the model

This is the function the rest of the Track calls. It does three jobs:

1. `choose_provider` picks a Provider: the `LLM_PROVIDER` setting if you set one, otherwise the first of the three whose key is present.
2. `load_provider` imports only that Provider's file with `importlib`. So the files for Providers you did not type are never needed.
3. `ask` logs what is about to be sent, then makes the call through `with_retries`.

Logging the prompt, system prompt and token cap means that when an answer looks wrong you can see exactly what the model was given. (Never log keys.) The logger is silent until something configures logging, which the final Step of the next Lesson does.

```python file=agent/llm.py
import importlib
import logging
import os
from types import ModuleType

from agent.config import load_env
from agent.retry import with_retries

log = logging.getLogger("agent")

PROVIDER_KEYS = {
    "claude": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}


def choose_provider() -> str:
    load_env()
    name = os.environ.get("LLM_PROVIDER", "").strip()
    if name:
        if name not in PROVIDER_KEYS:
            raise ValueError(f"Unknown LLM_PROVIDER {name!r}. Use one of {list(PROVIDER_KEYS)}.")
        return name
    for name, key in PROVIDER_KEYS.items():
        if os.environ.get(key, "").strip():
            return name
    raise RuntimeError("No API key found. Fill in one key in .env.")


def load_provider(name: str) -> ModuleType:
    return importlib.import_module(f"agent.llm_{name}")


def ask(
    prompt: str,
    *,
    provider: str | None = None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> str:
    name = provider or choose_provider()
    module = load_provider(name)
    log.info("ask provider=%s max_tokens=%d system=%r prompt=%r", name, max_tokens, system, prompt)
    return with_retries(lambda: module.ask(prompt, system=system, max_tokens=max_tokens))
```

## Reflection

- Why does each Provider get its own file and share one `ask()` signature, instead of one file full of `if provider == ...`?
- `with_retries` retries a 429 but not a 401. Why is retrying the second one a bad idea?
