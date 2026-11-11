from todo.tasks import add_task


def test_add_returns_a_task_with_the_title():
    tasks = []
    task = add_task(tasks, "buy milk")
    assert task["title"] == "buy milk"
    assert task["done"] is False


def test_add_stores_the_task_and_ids_are_unique():
    tasks = []
    first = add_task(tasks, "a")
    second = add_task(tasks, "b")
    assert tasks == [first, second]
    assert first["id"] != second["id"]
