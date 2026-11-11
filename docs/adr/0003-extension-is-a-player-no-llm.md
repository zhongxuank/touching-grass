# The extension is a player; Track Drafts come from a Claude Code skill

The VSCode extension only plays Tracks back (shows Steps, runs Checks, tracks progress) and makes no LLM calls itself, so it needs no API key. Track Drafts are written by a Claude Code skill in this repo, which takes the Learner's goal and produces the Track files. We chose this over building generation into the extension because the author already works in Claude Code, it keeps the extension small, and it keeps the "you type it, nothing writes it for you" spirit inside the editor.
