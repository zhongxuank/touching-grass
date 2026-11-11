# Track format

A Track is a folder of plain files. The engine's parser (`src/engine/parse.ts`) is the single source of truth: the Track-drafting skill must produce what it accepts. See `examples/sample-track` for a working Track.

```
my-track/
  track.md              # the Track file
  lessons/
    01-call-an-llm.md   # one Markdown file per Lesson
    02-tool-calling.md
  checks/
    test_key.py         # Check files named by `checks:` lines
```

## Track file (`track.md`)

YAML front matter, then optional free Markdown (ignored by the player).

```markdown
---
title: Build an AI agent from scratch
habits:
  - Keep secrets in .env
  - Small functions
lessons:
  - lessons/01-call-an-llm.md
  - lessons/02-tool-calling.md
---
```

| Field     | Required | Meaning                                                              |
| --------- | -------- | -------------------------------------------------------------------- |
| `title`   | yes      | Name of the Track.                                                   |
| `habits`  | no       | The Habits the Track models, as a list of strings.                   |
| `lessons` | yes      | Lesson files, relative to the Track folder, in the order to follow.  |

## Lesson file

YAML front matter with a `title`, then an optional intro, then ordered Steps, then an optional Reflection.

````markdown
---
title: Call an LLM
---
Intro text shown before the first Step.

## Step: Read the key

provider: claude
checks: test_key.py

Keep secrets in `.env`, never in code. This models the Keys in .env Habit.

```python file=app/config.py
import os
KEY = os.environ["ANTHROPIC_API_KEY"]
```

## Reflection

- Why keep the key out of the source file?
````

### Step

A `## Step: <title>` section. In order:

1. Optional reserved metadata lines, directly after the heading:
   - `provider: <name>` marks the Step as specific to a Provider. **Reserved:** parsed and exposed as `Step.provider`, not acted on yet.
   - `checks: <file>, <file>` lists the Check files the Step needs, by name, relative to the Track's `checks/` folder. Exposed as `Step.checks` and run by Run Checks (see Checks below). A Step with no `checks:` line has no Checks; the Learner marks it done by hand.
2. The explanation (Markdown, required). Shown first.
3. Exactly one fenced Code Chunk whose info string is `<language> file=<path>`, where `<path>` is the target file in the Learner's agent project. Shown second, with the target file named.

Nothing may follow the Code Chunk within a Step. Step ids are `<lesson file name>/<position>`, for example `01-call-an-llm/2`.

### Checks

Check files are pytest files in the Track's `checks/` folder. They ship with the Track and are readable by the Learner (the Step panel has an Open button per Check). They are not copied into the Learner's agent workspace. Run Checks runs each Check file as its own pytest run through uv:

```
uv run --with pytest pytest -q <track>/checks/<file> --rootdir <workspace>
```

with the Learner's agent workspace as the working directory and on `PYTHONPATH`, so a Check imports the Learner's code directly (`from app.config import KEY`). One Check file is one Check; it passes when pytest exits 0. A Step is done when all its Checks pass. Without `uv` or Python on the machine, the panel shows an explanatory message instead of results.

### Reflection

An optional `## Reflection` section at the end of the Lesson: a bullet list of ungraded questions. Parsed into `Lesson.reflection`; the player does not show it yet.

Any other `##` heading is a validation error. Validation errors name the file (relative to the Track folder) and the line.

## Engine interface

```ts
loadTrack(folder: string): Promise<LoadTrackResult>
// { ok: true, session: TrackSession } | { ok: false, errors: ValidationError[] }

interface TrackSession {
  readonly track: Track;                      // Track > Lesson > Step structure
  getStep(stepId: string): Step | undefined;
  setWorkspace(folder: string): void;        // the Learner's agent workspace, where Checks run
  runChecks(stepId: string): Promise<RunChecksOutcome>;
  markDone(stepId: string): boolean;         // only for Steps with no Checks
  isDone(stepId: string): boolean;
  advance(stepId: string): Step | undefined; // next Step, across Lessons, once this one is done
  getProgress(): Progress;                   // { doneSteps: string[] }, in memory for now
}
```

`loadTrack(folder, { checkRunner })` takes an optional Check runner; tests inject a fake.

The engine has no `vscode` import. The extension in `src/extension.ts` is a thin shell over it.
