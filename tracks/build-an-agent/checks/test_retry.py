import pytest

from agent.retry import is_retryable, with_retries


class ApiError(Exception):
    def __init__(self, status_code):
        super().__init__(f"status {status_code}")
        self.status_code = status_code


class APIConnectionError(Exception):
    pass


def test_is_retryable_by_status_and_by_connection_error():
    assert is_retryable(ApiError(429))
    assert is_retryable(ApiError(503))
    assert is_retryable(APIConnectionError("down"))
    assert not is_retryable(ApiError(401))
    assert not is_retryable(ValueError("bad"))


def test_retries_a_transient_error_then_succeeds():
    attempts = []
    waits = []

    def flaky():
        attempts.append(1)
        if len(attempts) < 3:
            raise ApiError(429)
        return "ok"

    assert with_retries(flaky, attempts=3, sleep=waits.append) == "ok"
    assert len(attempts) == 3
    assert len(waits) == 2
    assert waits[1] > waits[0]


def test_does_not_retry_a_permanent_error():
    attempts = []

    def bad_key():
        attempts.append(1)
        raise ApiError(401)

    with pytest.raises(ApiError):
        with_retries(bad_key, attempts=3, sleep=lambda s: None)
    assert len(attempts) == 1


def test_gives_up_after_the_last_attempt():
    attempts = []

    def always_down():
        attempts.append(1)
        raise ApiError(503)

    with pytest.raises(ApiError):
        with_retries(always_down, attempts=3, sleep=lambda s: None)
    assert len(attempts) == 3
