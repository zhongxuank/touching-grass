from collections.abc import Iterator

from agent.llm_openrouter import MODEL, make_client


def stream(
    prompt: str,
    *,
    client=None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 1024,
) -> Iterator[str]:
    client = client or make_client()
    chunks = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        stream=True,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    for chunk in chunks:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
