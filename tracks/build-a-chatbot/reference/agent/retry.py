import logging
import time
from typing import Callable, TypeVar

T = TypeVar("T")
log = logging.getLogger("agent")

RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504, 529}
RETRYABLE_NAMES = {"APIConnectionError", "APITimeoutError"}


def is_retryable(exc: Exception) -> bool:
    if getattr(exc, "status_code", None) in RETRYABLE_STATUS:
        return True
    return type(exc).__name__ in RETRYABLE_NAMES


def with_retries(
    call: Callable[[], T],
    *,
    attempts: int = 3,
    delay: float = 1.0,
    sleep: Callable[[float], None] | None = None,
) -> T:
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except Exception as exc:
            if attempt == attempts or not is_retryable(exc):
                raise
            wait = delay * 2 ** (attempt - 1)
            log.warning("API call failed (%s), retrying in %.1fs", exc, wait)
            (sleep or time.sleep)(wait)
    raise RuntimeError("unreachable")
