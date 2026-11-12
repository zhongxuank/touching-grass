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
