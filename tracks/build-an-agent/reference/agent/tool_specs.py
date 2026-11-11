TOOL_SPECS = [
    {
        "name": "get_time",
        "description": "Get the current date and time in UTC.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "add",
        "description": "Add two numbers and return the sum.",
        "parameters": {
            "type": "object",
            "properties": {
                "a": {"type": "number", "description": "The first number."},
                "b": {"type": "number", "description": "The second number."},
            },
            "required": ["a", "b"],
        },
    },
]
