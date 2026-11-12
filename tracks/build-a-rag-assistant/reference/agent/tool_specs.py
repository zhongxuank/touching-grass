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
    {
        "name": "search_notes",
        "description": (
            "Search the user's personal notes and return the most relevant passages, "
            "each starting with the note file it came from in square brackets. "
            "Use it for any question the notes might answer, and cite the file names."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "A short phrase describing what to look up."},
            },
            "required": ["query"],
        },
    },
]
