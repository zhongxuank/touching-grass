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
