def describe_error(exc: Exception) -> str:
    status = getattr(exc, "status_code", None)
    if status in (401, 403):
        return "The Provider rejected your API key. Check the key in .env and the Provider chosen in the sidebar."
    if status == 429:
        return "The Provider says you are sending too many requests. Wait a moment and try again."
    return f"Something went wrong: {exc}"
