from collections.abc import Iterator

from agent.llm_claude import MODEL, make_client


def stream(
    prompt: str,
    *,
    client=None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> Iterator[str]:
    client = client or make_client()
    with client.messages.stream(
        model=MODEL,
        max_tokens=max_tokens,
        output_config={"effort": "low"},
        system=system,
        messages=[{"role": "user", "content": prompt}],
    ) as response:
        yield from response.text_stream
