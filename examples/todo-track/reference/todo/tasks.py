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
