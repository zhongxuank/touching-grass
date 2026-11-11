import json
from pathlib import Path

DEFAULT_PATH = Path("tasks.json")


def load_tasks(path: Path = DEFAULT_PATH) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text())


def save_tasks(tasks: list[dict], path: Path = DEFAULT_PATH) -> None:
    path.write_text(json.dumps(tasks, indent=2))
