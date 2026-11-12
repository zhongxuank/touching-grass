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
