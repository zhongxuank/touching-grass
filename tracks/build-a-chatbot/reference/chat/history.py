def add_message(history: list[dict], role: str, content: str, **extra) -> None:
    history.append({"role": role, "content": content, **extra})


def build_prompt(history: list[dict], question: str) -> str:
    lines = [
        f"{message['role'].capitalize()}: {message['content']}"
        for message in history
        if not message.get("error")
    ]
    if not lines:
        return question
    return "Conversation so far:\n" + "\n".join(lines) + f"\n\nLatest question: {question}"
