# touching-grass

A VSCode extension that walks a learner through building real things by hand, one step at a time, so they understand what each piece does instead of having AI write it for them.

## Language

**Learner**:
The person writing the code by hand. For now this is the author; the tool is meant to be open-sourced later.
_Avoid_: User, student

**Track**:
An ordered series of Lessons that builds toward one skill (e.g. "build an AI agent from scratch"). Any skill can be a Track; AI agents is the first.
_Avoid_: Course, curriculum, path

**Lesson**:
One concept within a Track (e.g. "call an LLM", "tool calling", "RAG"), made up of Steps.
_Avoid_: Module, chapter, exercise

**Step**:
The smallest unit of guidance: an explanation of what the next piece does and why, followed by the Learner writing that piece by hand.
_Avoid_: Task, instruction
