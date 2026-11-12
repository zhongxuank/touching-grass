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
