import logging

from agent.llm_claude import MODEL, make_client, response_text
from agent.retry import with_retries
from agent.tool_specs import TOOL_SPECS
from agent.tools import run_tool

log = logging.getLogger("agent")

SYSTEM = "You are a helpful assistant. Use the tools when they help. Answer briefly."


def to_claude_tools(specs: list[dict]) -> list[dict]:
    return [
        {"name": s["name"], "description": s["description"], "input_schema": s["parameters"]}
        for s in specs
    ]


def find_tool_uses(response) -> list:
    return [block for block in response.content if block.type == "tool_use"]


def tool_results_message(tool_uses: list) -> dict:
    results = [
        {"type": "tool_result", "tool_use_id": use.id, "content": run_tool(use.name, use.input)}
        for use in tool_uses
    ]
    return {"role": "user", "content": results}


def run_agent(prompt: str, *, client=None, max_steps: int = 5) -> str:
    client = client or make_client()
    messages = [{"role": "user", "content": prompt}]
    for _ in range(max_steps):
        log.info("sending %d messages to %s", len(messages), MODEL)
        response = with_retries(
            lambda: client.messages.create(
                model=MODEL,
                max_tokens=1024,
                output_config={"effort": "low"},
                system=SYSTEM,
                tools=to_claude_tools(TOOL_SPECS),
                messages=messages,
            )
        )
        if response.stop_reason != "tool_use":
            return response_text(response)
        tool_uses = find_tool_uses(response)
        for use in tool_uses:
            log.info("model called %s(%s)", use.name, use.input)
        messages.append({"role": "assistant", "content": response.content})
        messages.append(tool_results_message(tool_uses))
    raise RuntimeError(f"Agent did not finish within {max_steps} steps")
