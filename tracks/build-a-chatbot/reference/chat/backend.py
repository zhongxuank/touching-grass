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
