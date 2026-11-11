import json
import logging

from agent.retry import with_retries
from agent.tool_specs import TOOL_SPECS
from agent.tools import run_tool

log = logging.getLogger("agent")

SYSTEM = "You are a helpful assistant. Use the tools when they help. Answer briefly."


def to_openai_tools(specs: list[dict]) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": s["name"],
                "description": s["description"],
                "parameters": s["parameters"],
            },
        }
        for s in specs
    ]


def assistant_message(message) -> dict:
    calls = [
        {
            "id": call.id,
            "type": "function",
            "function": {"name": call.function.name, "arguments": call.function.arguments},
        }
        for call in message.tool_calls
    ]
    return {"role": "assistant", "content": message.content, "tool_calls": calls}


def tool_messages(message) -> list[dict]:
    results = []
    for call in message.tool_calls:
        try:
            args = json.loads(call.function.arguments or "{}")
            content = run_tool(call.function.name, args)
        except json.JSONDecodeError:
            content = "Error: arguments were not valid JSON"
        log.info("model called %s(%s)", call.function.name, call.function.arguments)
        results.append({"role": "tool", "tool_call_id": call.id, "content": content})
    return results


def run_loop(client, model: str, prompt: str, *, max_steps: int = 5) -> str:
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": prompt},
    ]
    for _ in range(max_steps):
        log.info("sending %d messages to %s", len(messages), model)
        response = with_retries(
            lambda: client.chat.completions.create(
                model=model,
                max_tokens=500,
                tools=to_openai_tools(TOOL_SPECS),
                messages=messages,
            )
        )
        choice = response.choices[0]
        if choice.finish_reason != "tool_calls":
            return choice.message.content or ""
        messages.append(assistant_message(choice.message))
        messages.extend(tool_messages(choice.message))
    raise RuntimeError(f"Agent did not finish within {max_steps} steps")
