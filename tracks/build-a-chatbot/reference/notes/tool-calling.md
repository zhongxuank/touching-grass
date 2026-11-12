# Tool calling

A language model only produces text. It cannot read a clock, query a database or do reliable arithmetic by itself. Tool calling lets it ask your program to do those jobs for it.

You describe each tool with a name, a plain-English description and a schema for its arguments. The description matters most, because it is how the model decides whether a tool fits the question.

The model never runs a tool. It only replies with the tool name and the arguments, and your code decides whether and how to run it. The result goes back to the model as a new message tagged with the id of the request it answers.
