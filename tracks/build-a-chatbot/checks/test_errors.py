from chat.errors import describe_error


class FakeApiError(Exception):
    def __init__(self, status_code):
        super().__init__(f"error {status_code}")
        self.status_code = status_code


def test_a_rejected_key_tells_the_learner_to_check_the_key():
    message = describe_error(FakeApiError(401))
    assert "key" in message.lower()
    assert describe_error(FakeApiError(403)) == message


def test_too_many_requests_is_a_different_message_from_a_bad_key():
    assert describe_error(FakeApiError(429)) != describe_error(FakeApiError(401))
    assert describe_error(FakeApiError(429)).strip()


def test_any_other_error_keeps_its_original_message():
    message = describe_error(RuntimeError("ANTHROPIC_API_KEY is missing."))
    assert "ANTHROPIC_API_KEY is missing." in message
    assert isinstance(describe_error(ValueError("boom")), str)
    assert "boom" in describe_error(ValueError("boom"))
