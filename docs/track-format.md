# Track format

A Track is a folder of plain files. The engine's parser (`src/engine/parse.ts`) is the single source of truth: the Track-drafting skill must produce what it accepts. See `examples/sample-track` for a working Track.

```
my-track/
  track.md              # the Track file
  lessons/
    01-call-an-llm.md   # one Markdown file per Lesson
    02-tool-calling.md
  checks/
    test_key.py         # Check files, named by a Step's `checks:` line
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

Each Lesson file is listed once. Two Lesson files must not share an id, which is the file name without its extension (`lessons/a/01.md` and `lessons/b/01.md` both have id `01`, so one must be renamed).

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
   - `checks: <file>, <file>` lists the Check files the Step needs. **Reserved:** parsed and exposed as `Step.checks`, not run yet. Each name is a file in the Track's `checks/` folder, so `checks: test_key.py` means `my-track/checks/test_key.py`. Names are relative to `checks/`, not to the Track folder, and a file that is not there is a validation error.
2. The explanation (Markdown, required). Shown first.
3. Exactly one fenced Code Chunk whose info string is `<language> file=<path>`, where `<path>` is the target file in the Learner's agent project. Shown second, with the target file named. The Code Chunk must have code in it: an empty fence is a validation error.

Nothing may follow the Code Chunk within a Step. Step ids are `<lesson file name>/<position>`, for example `01-call-an-llm/2`.

### Reflection

An optional `## Reflection` section at the end of the Lesson: a bullet list of ungraded questions. Parsed into `Lesson.reflection`; the player does not show it yet.

Any other `##` heading is a validation error. Validation errors name the file (relative to the Track folder) and the line.

## Validating a Track

Check a Track folder from the command line (run `npm run build` first):

```sh
npm run validate-track -- path/to/my-track
```

It prints each problem as `file:line: message` and exits 1. A valid Track prints a one-line summary and exits 0. In VSCode, run **Touching Grass: Validate Track** to see the same problems in the Problems panel.

## Engine interface

```ts
loadTrack(folder: string): Promise<LoadTrackResult>
// { ok: true, session: TrackSession } | { ok: false, errors: ValidationError[] }

interface TrackSession {
  readonly track: Track;                      // Track > Lesson > Step structure
  getStep(stepId: string): Step | undefined;
}
```

The engine has no `vscode` import. The extension in `src/extension.ts` is a thin shell over it.
