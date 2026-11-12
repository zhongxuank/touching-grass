# The agent loop

An AI agent is a loop around a language model, and this cycle is called the agent loop. Each round, the program sends the conversation so far to the model and reads what comes back.

If the reply is a request to use a tool, the program runs that tool, adds the result to the conversation, and goes round again. If the reply is plain text, the loop ends and that text is the final answer.

Every loop needs a step limit. A confused model can keep asking for tools forever, so the program counts the rounds and stops with an error after a fixed number, such as five.
