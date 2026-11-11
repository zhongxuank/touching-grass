---
title: Save tasks and add a command line
---
The logic works in memory. Now the tasks get saved to a file and you get a command to run from the terminal.

## Step: Save and load tasks

checks: test_storage.py
habit: Keep logic separate from input and output

Storage is the only code that touches the disk. `load_tasks` reads a JSON file and returns the list, or an empty list if the file does not exist yet, so the first run needs no setup. `save_tasks` writes the list back with `indent=2` so the file is readable. Both take the path as an argument with a default, which lets tests use a temporary file and never touch your real list.

```python file=todo/storage.py
import json
from pathlib import Path

DEFAULT_PATH = Path("tasks.json")


def load_tasks(path: Path = DEFAULT_PATH) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text())


def save_tasks(tasks: list[dict], path: Path = DEFAULT_PATH) -> None:
    path.write_text(json.dumps(tasks, indent=2))
```

## Step: Parse commands

checks: test_cli.py
habit: Test behaviour, not text

`argparse` turns what the user typed into a structured choice. This file defines three subcommands: `add <title>`, `done <id>` and `list`. `main` takes the argument list and the storage path as parameters, and returns the lines to show instead of printing them. That makes it testable: a test can call `main(["add", "milk"], path)` and look at the result. It loads the tasks, runs the command, saves them, and returns the output lines.

```python file=todo/cli.py
import argparse
from pathlib import Path

from todo.storage import DEFAULT_PATH, load_tasks, save_tasks
from todo.tasks import add_task, complete_task


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="todo")
    sub = parser.add_subparsers(dest="command", required=True)
    add = sub.add_parser("add")
    add.add_argument("title")
    done = sub.add_parser("done")
    done.add_argument("id", type=int)
    sub.add_parser("list")
    return parser


def main(argv: list[str], path: Path = DEFAULT_PATH) -> list[str]:
    args = build_parser().parse_args(argv)
    tasks = load_tasks(path)
    if args.command == "add":
        task = add_task(tasks, args.title)
        lines = [f"Added {task['id']}: {task['title']}"]
    elif args.command == "done":
        try:
            task = complete_task(tasks, args.id)
        except KeyError:
            return [f"No task with id {args.id}"]
        lines = [f"Completed {task['id']}: {task['title']}"]
    else:
        lines = [
            f"[{'x' if t['done'] else ' '}] {t['id']}: {t['title']}" for t in tasks
        ]
    save_tasks(tasks, path)
    return lines
```

## Step: Make it runnable

checks: test_run.py

Python runs a package when it contains `__main__.py`, so `uv run python -m todo list` will work. This file is the thin outer layer: it takes the real command line, calls `main`, and prints each line. It is the only place that prints, which is why everything else stayed easy to test. Try `uv run python -m todo add "buy milk"` and then `uv run python -m todo list`.

```python file=todo/__main__.py
import sys

from todo.cli import main

for line in main(sys.argv[1:]):
    print(line)
```

## Reflection

- Why does `main` return lines and not print them?
- What happens on the very first run, when `tasks.json` does not exist yet, and which line makes that work?
