from todo.cli import main


def test_added_tasks_show_up_in_list_and_persist(tmp_path):
    path = tmp_path / "tasks.json"
    main(["add", "buy milk"], path)
    lines = main(["list"], path)
    assert len(lines) == 1
    assert "buy milk" in lines[0]


def test_done_changes_the_listing(tmp_path):
    path = tmp_path / "tasks.json"
    main(["add", "buy milk"], path)
    before = main(["list"], path)
    main(["done", "1"], path)
    after = main(["list"], path)
    assert before != after
    assert "buy milk" in after[0]


def test_done_with_unknown_id_reports_instead_of_crashing(tmp_path):
    lines = main(["done", "42"], tmp_path / "tasks.json")
    assert len(lines) == 1
