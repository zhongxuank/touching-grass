from agent.llm_openai import MODEL, make_client
from agent.openai_loop import run_loop


def run_agent(prompt: str, *, client=None, max_steps: int = 5) -> str:
    return run_loop(client or make_client(), MODEL, prompt, max_steps=max_steps)
