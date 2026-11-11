---
title: Tool calling
---
An LLM on its own only produces text. It cannot read a clock or do reliable arithmetic. **Tool calling** fixes that: you describe some functions to the model, and instead of answering directly it can reply "please run `add` with a=2, b=3". Your code runs the function and sends the result back, and the model uses it to write the final answer. Repeating that cycle until the model stops asking for tools is the **agent loop**, and it is the core of every AI agent.

The model never runs anything itself. It only asks. Your code decides what actually executes.

You will write two tools, describe them once in a neutral form, and then write the loop for your Provider. Anthropic's tool format differs from OpenAI's, so Claude has its own Steps. OpenRouter uses OpenAI's format, so OpenAI and OpenRouter share one loop and each add a very small file of their own. Use the Provider you chose in Lesson 1.

## Step: Write two tools

checks: test_tools.py
habit: Type hints

A tool is an ordinary Python function. `get_time` takes nothing and returns the current UTC time. `add` takes two numbers. The type hints (`a: float`, `-> float`) document what goes in and out, and you will mirror them in the tool description shortly.

`TOOLS` maps a tool's name to its function. `run_tool` is what the loop will call: it looks up the name and calls the function with the arguments the model gave. Anything that goes wrong (unknown name, wrong arguments) comes back as an `Error: ...` string instead of crashing. That way the model sees what went wrong and can correct itself.

```python file=agent/tools.py
from datetime import datetime, timezone


def get_time() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def add(a: float, b: float) -> float:
    return a + b


TOOLS = {"get_time": get_time, "add": add}


def run_tool(name: str, args: dict) -> str:
    func = TOOLS.get(name)
    if func is None:
        return f"Error: unknown tool {name}"
    try:
        return str(func(**args))
    except Exception as exc:
        return f"Error: {exc}"
```

## Step: Describe the tools to the model

checks: test_tool_specs.py

The model cannot see your Python code. You give it a **tool schema** for each tool: a name, a plain-English description of when to use it, and a JSON Schema for its arguments. JSON Schema is a standard way to say "an object with a number `a` and a number `b`, both required". The description matters: it is how the model decides whether a tool fits the question.

Both Providers want the same information in slightly different wrappers. So you write it once here, in a neutral shape, and each Provider's Steps will convert it.

```python file=agent/tool_specs.py
TOOL_SPECS = [
    {
        "name": "get_time",
        "description": "Get the current date and time in UTC.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "add",
        "description": "Add two numbers and return the sum.",
        "parameters": {
            "type": "object",
            "properties": {
                "a": {"type": "number", "description": "The first number."},
                "b": {"type": "number", "description": "The second number."},
            },
            "required": ["a", "b"],
        },
    },
]
```

## Step: Claude tool format and tool calls

provider: claude
checks: test_agent_claude_format.py

Three small functions, one job each:

- `to_claude_tools` wraps each neutral spec in Anthropic's format. The only change is that the argument schema is called `input_schema`.
- `find_tool_uses` looks through the response's content blocks for the ones with `type == "tool_use"`. Each such block has an `id`, the tool's `name`, and `input`, the arguments as a dictionary. The reply may hold text blocks as well, and may ask for several tools at once.
- `tool_results_message` runs each requested tool and builds the **tool-result message**: a message with role `"user"` whose content is one `tool_result` block per call. Each block carries the `tool_use_id` it answers, so the model can match results to requests.

```python file=agent/agent_claude.py
from agent.tools import run_tool


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
```

## Step: Claude agent loop

provider: claude
checks: test_agent_claude.py
habit: Small functions

Now the loop. Each round it sends the whole conversation plus the tool schemas. The response has a **stop reason** that says why the model stopped. `"tool_use"` means "I want a tool run". Anything else (usually `"end_turn"`) means it finished, so we return its text. When it wants a tool, we append two messages: the assistant's reply exactly as received, then the tool-result message, and go round again. Appending `response.content` (the whole list of blocks, not just the text) is important: it carries the model's thinking blocks and its `tool_use` blocks back to it, so the model sees its own earlier reasoning and the request your tool result answers. Without it the model would not remember asking.

The call uses the same two settings as Lesson 1: `effort` low and `max_tokens=1024`, because thinking tokens count toward `max_tokens`.

`max_steps` stops a confused model from looping forever. The send is logged, and wrapped in `with_retries` from Lesson 1.

Note that `run_agent` takes the `client` as an argument instead of creating it inside. That keeps each function small and testable: the Check hands it a scripted fake client, so the loop logic is tested with no network and no key. The real client is only created when you pass none.

This replaces `agent/agent_claude.py`. Keep the three functions as they were and add the imports, `SYSTEM` and `run_agent`.

```python file=agent/agent_claude.py
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
```

## Step: The loop in OpenAI's format

checks: test_openai_loop.py

OpenAI and OpenRouter use the same format, so this one file serves both. It has no `provider:` because it never touches the network by itself: the `client` is passed in. The same loop idea, different shapes:

- Tool schemas are wrapped as `{"type": "function", "function": {...}}`, and the argument schema is called `parameters`.
- The reply to inspect is `choices[0].message`. Its **finish reason** is `"tool_calls"` when the model wants tools run, and `"stop"` when it is done.
- Each tool call has an `id` and a `function` with a `name` and `arguments`. The arguments arrive as a JSON **string**, so we parse them with `json.loads`.
- The tool-result message has role `"tool"` and a `tool_call_id`, one message per call. Before them, we append the assistant's message, rebuilt as a dictionary with its `tool_calls`.

If you are following the Claude Steps, read this one for the contrast and type it anyway: its Check needs no key.

```python file=agent/openai_loop.py
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
```

## Step: OpenAI agent

provider: openai
checks: test_agent_openai.py

All the work is in `run_loop`. This file only supplies the OpenAI client and its cheap model from Lesson 1, and keeps the same `run_agent(prompt, client=None)` signature as the Claude file. The Check runs a real question through the model, so it needs your key.

```python file=agent/agent_openai.py
from agent.llm_openai import MODEL, make_client
from agent.openai_loop import run_loop


def run_agent(prompt: str, *, client=None, max_steps: int = 5) -> str:
    return run_loop(client or make_client(), MODEL, prompt, max_steps=max_steps)
```

## Step: OpenRouter agent

provider: openrouter
checks: test_agent_openrouter.py

The same file again, pointing at OpenRouter's client and model. This is the whole difference between the two Providers: same API format, different address.

```python file=agent/agent_openrouter.py
from agent.llm_openrouter import MODEL, make_client
from agent.openai_loop import run_loop


def run_agent(prompt: str, *, client=None, max_steps: int = 5) -> str:
    return run_loop(client or make_client(), MODEL, prompt, max_steps=max_steps)
```

## Step: One run_agent() for every Provider

checks: test_run.py

Like `ask` in Lesson 1, this picks the Provider with `choose_provider` and imports only that Provider's agent file. Everything after this in the Track calls `run_agent(prompt)` and does not care which Provider is behind it.

```python file=agent/run.py
import importlib
from types import ModuleType

from agent.llm import choose_provider


def load_agent(name: str) -> ModuleType:
    return importlib.import_module(f"agent.agent_{name}")


def run_agent(prompt: str, *, provider: str | None = None) -> str:
    return load_agent(provider or choose_provider()).run_agent(prompt)
```

## Step: Run your agent

Time to use it. `logging.basicConfig(level=logging.INFO)` turns on the logging you wrote in both Lessons, so you will see every request sent to the model and every tool it calls, followed by the final answer. Run it with `uv run python main.py`. A question that needs both tools shows several trips round the loop.

```python file=main.py
import logging

from agent.run import run_agent

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

if __name__ == "__main__":
    print(run_agent("What time is it in UTC, and what is 1234 plus 5678?"))
```

## Reflection

- Why does the assistant's tool request have to be appended to `messages` before the tool result?
- What stops the loop from running forever, and what happens if the model keeps asking for tools?
