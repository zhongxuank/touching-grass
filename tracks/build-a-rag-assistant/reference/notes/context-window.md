# The context window

A model can only read a limited amount of text at once. That limit is the context window, and it is measured in tokens, where a token is about three quarters of a word.

The prompt, the conversation history, the tool results and the reply all share the window. When a lengthy conversation fills it, the oldest messages must be dropped or summarised, so the model no longer knows what happened at the start.

Retrieval is one way to cope. Instead of pasting every document into the prompt, the program searches for the few passages that matter and sends only those.
