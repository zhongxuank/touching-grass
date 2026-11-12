import re

NOTE_NAME = re.compile(r"\[([^\[\]]+\.md)\]")


def find_sources(calls: list[dict]) -> list[str]:
    found: list[str] = []
    for call in calls:
        if call["name"] != "search_notes" or call["error"]:
            continue
        for name in NOTE_NAME.findall(call["result"]):
            if name not in found:
                found.append(name)
    return found
