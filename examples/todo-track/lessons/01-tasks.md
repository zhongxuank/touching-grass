---
title: Model the tasks
---
You will build a to-do list you can use from the terminal. This Lesson sets up the project and writes the core logic: plain functions that add and complete tasks, with no printing and no files yet.

## Step: Set up the project

uv manages Python projects and their dependencies. A `pyproject.toml` is the project's identity card: its name, the Python version it needs, and the libraries it depends on. This one has no dependencies yet. The `[tool.pytest.ini_options]` part tells pytest to treat the project folder as the place to import your code from.

```toml file=pyproject.toml
[project]
name = "todo"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = []

[tool.pytest.ini_options]
pythonpath = ["."]
```

## Step: Ignore files that should not be committed

Some files are generated or private, and committing them clutters the repository. This ignore file lists them. `.venv/` is the virtual environment uv creates, `__pycache__/` holds compiled Python, `tasks.json` is your personal list, and `.env` is where secrets live if you add some later. Listing `.env` now is easier than removing a leaked secret afterwards.

```gitignore file=.gitignore
.venv/
__pycache__/
.env
tasks.json
```

## Step: Add a task

checks: test_add.py
habit: Keep logic separate from input and output

A task is a small dictionary with an `id`, a `title` and a `done` flag. `add_task` takes the current list of tasks, builds the new one and appends it. Notice it does not print anything or touch a file: logic that only takes values and returns values is easy to test and easy to reuse from a CLI later. The new id is one more than the largest existing id, so ids never repeat even after tasks are removed. `max(..., default=0)` handles the empty list.

```python file=todo/tasks.py
def add_task(tasks: list[dict], title: str) -> dict:
    next_id = max((t["id"] for t in tasks), default=0) + 1
    task = {"id": next_id, "title": title, "done": False}
    tasks.append(task)
    return task
```

## Step: Complete a task

checks: test_complete.py
habit: Small functions
place: Replace the whole file. `add_task` stays as it was, `complete_task` is new

`complete_task` looks a task up by id and marks it done. It raises `KeyError` for an unknown id instead of silently doing nothing, so a typo surfaces as an error the CLI can report later. This replaces `todo/tasks.py` with the file below: keep `add_task` exactly as it was and add the new function after it.

```python file=todo/tasks.py
def add_task(tasks: list[dict], title: str) -> dict:
    next_id = max((t["id"] for t in tasks), default=0) + 1
    task = {"id": next_id, "title": title, "done": False}
    tasks.append(task)
    return task


def complete_task(tasks: list[dict], task_id: int) -> dict:
    for task in tasks:
        if task["id"] == task_id:
            task["done"] = True
            return task
    raise KeyError(task_id)
```

## Reflection

- Why does `add_task` return the new task and not print it?
- What would go wrong if the new id were `len(tasks) + 1`?
