from openai import OpenAI

from agent.config import get_key

MODEL = "gpt-4o-mini"


def make_client() -> OpenAI:
    return OpenAI(api_key=get_key("OPENAI_API_KEY"), max_retries=0)


def response_text(response) -> str:
    return response.choices[0].message.content or ""


def ask(
    prompt: str,
    *,
    client: OpenAI | None = None,
    system: str = "You are a helpful assistant. Answer briefly.",
    max_tokens: int = 300,
) -> str:
    client = client or make_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return response_text(response)
