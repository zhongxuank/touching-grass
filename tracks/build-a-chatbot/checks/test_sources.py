from chat.sources import find_sources


def call(name, result, error=False):
    return {"name": name, "args": {}, "result": result, "error": error}


def test_it_finds_the_note_files_in_search_results_once_each_in_order():
    calls = [
        call("search_notes", "[agent-loop.md] The loop ends.\n\n[tool-calling.md] Tools run."),
        call("search_notes", "[agent-loop.md] More about the loop."),
    ]
    assert find_sources(calls) == ["agent-loop.md", "tool-calling.md"]


def test_other_tools_and_failed_searches_are_ignored():
    calls = [
        call("add", "[not-a-source.md] 5"),
        call("search_notes", "Error: index missing [broken.md]", error=True),
    ]
    assert find_sources(calls) == []


def test_a_search_with_no_results_gives_no_sources():
    assert find_sources([call("search_notes", "No relevant notes found.")]) == []
    assert find_sources([]) == []
