# touching-grass

A VSCode extension that walks a learner through building real things by hand, one step at a time, so they understand what each piece does instead of having AI write it for them.

## Language

**Learner**:
The person writing the code by hand. For now this is the author; the tool is meant to be open-sourced later.
_Avoid_: User, student

**Track**:
An ordered series of Lessons that builds toward one skill (e.g. "build an AI agent from scratch"). Any skill can be a Track; AI agents is the first.
_Avoid_: Course, curriculum, path

**Track Draft**:
A Track an LLM has generated from the Learner's stated goal, saved as files, that the Learner reviews and edits before following it.
_Avoid_: Generated course

**Lesson**:
One concept within a Track (e.g. "call an LLM", "tool calling", "RAG"), made up of Steps.
_Avoid_: Module, chapter, exercise

**Step**:
The smallest unit of guidance: an explanation of what the next Code Chunk does and why, followed by the Learner typing that Code Chunk themselves.
_Avoid_: Task, instruction

**Code Chunk**:
A short piece of real, working code shown in a Step for the Learner to type by hand (never paste) and understand line by line.
_Avoid_: Snippet, solution, answer

**Check**:
A test the Learner can see and read that confirms the code they typed works. Checks confirm the build works; they are not a quiz on the Learner's skill.
_Avoid_: Grader, assessment

**Habit**:
A good engineering practice a Track deliberately models and calls out (e.g. keeping secrets in `.env`). Each Track names a few.
_Avoid_: Rule, best practice
