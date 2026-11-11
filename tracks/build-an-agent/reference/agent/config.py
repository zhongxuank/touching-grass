import os

from dotenv import load_dotenv


def load_env() -> None:
    load_dotenv()


def get_key(name: str) -> str:
    load_env()
    key = os.environ.get(name, "").strip()
    if not key:
        raise RuntimeError(f"{name} is missing. Copy .env.example to .env and fill it in.")
    return key
