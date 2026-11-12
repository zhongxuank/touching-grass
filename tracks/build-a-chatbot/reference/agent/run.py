import importlib
from types import ModuleType

from agent.llm import choose_provider


def load_agent(name: str) -> ModuleType:
    return importlib.import_module(f"agent.agent_{name}")


def run_agent(prompt: str, *, provider: str | None = None) -> str:
    return load_agent(provider or choose_provider()).run_agent(prompt)
