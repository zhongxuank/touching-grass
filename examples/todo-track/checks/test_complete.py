import pytest

from todo.tasks import add_task, complete_task


def test_complete_marks_only_that_task_done():
    tasks = []
    a = add_task(tasks, "a")
    b = add_task(tasks, "b")
    complete_task(tasks, a["id"])
    assert a["done"] is True
    assert b["done"] is False


def test_complete_unknown_id_raises_key_error():
    with pytest.raises(KeyError):
        complete_task([], 99)
