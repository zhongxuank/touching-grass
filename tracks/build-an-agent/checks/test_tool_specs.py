import inspect

from agent.tool_specs import TOOL_SPECS
from agent.tools import TOOLS


def test_every_spec_has_the_expected_shape():
    assert TOOL_SPECS
    for spec in TOOL_SPECS:
        assert isinstance(spec["name"], str) and spec["name"]
        assert isinstance(spec["description"], str) and spec["description"]
        params = spec["parameters"]
        assert params["type"] == "object"
        assert set(params["required"]) <= set(params["properties"])


def test_every_spec_matches_a_real_tool_and_its_arguments():
    names = [spec["name"] for spec in TOOL_SPECS]
    assert len(names) == len(set(names))
    for spec in TOOL_SPECS:
        assert spec["name"] in TOOLS
        accepted = set(inspect.signature(TOOLS[spec["name"]]).parameters)
        assert set(spec["parameters"]["properties"]) == accepted
