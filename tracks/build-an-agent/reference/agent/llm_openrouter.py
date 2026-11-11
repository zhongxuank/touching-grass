from openai import OpenAI

from agent.config import get_key

MODEL = "openai/gpt-4o-mini"
BASE_URL = "https://openrouter.ai/api/v1"


def make_client() -> OpenAI:
    return OpenAI(api_key=get_key("OPENROUTER_API_KEY"), base_url=BASE_URL, max_retries=0)


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
