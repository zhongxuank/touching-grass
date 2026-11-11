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
