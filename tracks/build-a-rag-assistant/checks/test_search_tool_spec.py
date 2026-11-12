import inspect

from agent.tool_specs import TOOL_SPECS
from agent.tools import TOOLS


def test_search_notes_is_described_with_one_required_query_string():
    specs = {spec["name"]: spec for spec in TOOL_SPECS}
    assert {"get_time", "add", "search_notes"} <= set(specs)
    spec = specs["search_notes"]
    assert isinstance(spec["description"], str) and spec["description"]
    assert spec["parameters"]["type"] == "object"
    assert spec["parameters"]["properties"]["query"]["type"] == "string"
    assert spec["parameters"]["required"] == ["query"]


def test_every_spec_matches_a_real_tool_and_its_arguments():
    names = [spec["name"] for spec in TOOL_SPECS]
    assert len(names) == len(set(names))
    for spec in TOOL_SPECS:
        assert spec["name"] in TOOLS
        accepted = set(inspect.signature(TOOLS[spec["name"]]).parameters)
        assert set(spec["parameters"]["properties"]) == accepted
        assert set(spec["parameters"]["required"]) <= set(spec["parameters"]["properties"])
