from todo.storage import load_tasks, save_tasks


def test_missing_file_loads_as_empty_list(tmp_path):
    assert load_tasks(tmp_path / "none.json") == []


def test_saved_tasks_load_back_unchanged(tmp_path):
    path = tmp_path / "tasks.json"
    tasks = [{"id": 1, "title": "a", "done": False}]
    save_tasks(tasks, path)
    assert load_tasks(path) == tasks
