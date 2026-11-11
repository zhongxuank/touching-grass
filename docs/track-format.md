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

1. Optional metadata lines, directly after the heading:
   - `provider: <name>` marks the Step as specific to a Provider: `claude`, `openai` or `openrouter`. Any other name is a validation error naming the file and line. Exposed as `Step.provider`; see Providers below.
   - `checks: <file>, <file>` lists the Check files the Step needs, by name, relative to the Track's `checks/` folder. Exposed as `Step.checks` and run by Run Checks (see Checks below). A Step with no `checks:` line has no Checks; the Learner marks it done by hand. A name that is not a file in `checks/` is a validation error.
   - `habit: <name>` names the Track Habit the Step's Code Chunk models. The name must match one of the Track's `habits` exactly, or the Track fails validation. Shown as a callout between the explanation and the Code Chunk.
2. The explanation (Markdown, required). Shown first.
3. Exactly one fenced Code Chunk whose info string is `<language> file=<path>`, where `<path>` is the target file in the Learner's agent project. Shown second, with the target file named. The Code Chunk must have code in it: an empty fence is a validation error.

Nothing may follow the Code Chunk within a Step. Step ids are `<lesson file name>/<position>`, for example `01-call-an-llm/2`.

### Checks

Check files are pytest files in the Track's `checks/` folder. They ship with the Track and are readable by the Learner (the Step panel has an Open button per Check). They are not copied into the Learner's agent workspace. Run Checks runs each Check file as its own pytest run through uv:

```
uv run --with pytest pytest -q <track>/checks/<file> --rootdir <workspace>
```

with the Learner's agent workspace as the working directory and on `PYTHONPATH`, so a Check imports the Learner's code directly (`from app.config import KEY`). One Check file is one Check; it passes when pytest exits 0. A Step is done when all its Checks pass. Without `uv` or Python on the machine, the panel shows an explanatory message instead of results.

### Providers

The Provider names and the key each needs in the Learner's `.env` (or, as a fallback, the process environment):

| Provider     | Key                  |
| ------------ | -------------------- |
| `claude`     | `ANTHROPIC_API_KEY`  |
| `openai`     | `OPENAI_API_KEY`     |
| `openrouter` | `OPENROUTER_API_KEY` |

The player only checks that a key is present and non-empty; it never shows or logs a key. Keys are looked up again each time Checks are run, so adding one later needs no reload. The Learner's `.env` values are passed to the Check runner's environment, so Checks can call a real LLM.

- **Read-only Steps.** A Provider Step whose key is missing is read-only: the panel says "No key for <Provider>. Read along, your Checks are skipped." Its Checks do not run and it counts as done for progression (recorded in `skippedSteps` in the progress file), so one key is enough to finish the first Lesson. Adding the key later and running Checks runs them normally.
- **Choice.** When the Learner advances out of the first Lesson that contains Provider Steps and has not chosen, the player asks them to choose one of the Providers that have a key. The choice is saved as `chosenProvider` in the progress file. From then on, Provider Steps for other Providers in later Lessons are hidden from the Step order and the sidebar. Steps with no `provider:` line always show. A Track meant for this should put side-by-side Provider Steps in its first Provider Lesson.

### Reflection

An optional `## Reflection` section at the end of the Lesson: a bullet list of ungraded questions. Parsed into `Lesson.reflection`. The player shows it as a "Reflection" item last under the Lesson in the sidebar, marked ungraded and optional.

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
  setWorkspace(folder: string): void;        // the Learner's agent workspace, where Checks run (no progress read)
  openWorkspace(folder: string): Promise<{ notice?: string }>; // set the workspace and load its progress file
  runChecks(stepId: string): Promise<RunChecksOutcome>;
  markDone(stepId: string): boolean;         // only for Steps with no Checks
  isDone(stepId: string): boolean;
  advance(stepId: string): Step | undefined; // next visible Step, across Lessons, once this one is done (or skipped)
  detectProviders(): Promise<Provider[]>;    // Providers with a key; presence only
  providerChoiceNeeded(): boolean;           // advance held the next Step until a Provider is chosen
  chooseProvider(provider: string): Step | undefined; // saves the choice; returns the held Step
  getVisibleSteps(): Step[];                 // Steps after Provider filtering
  getCurrentStep(): string | undefined;      // the Step the Learner is on; the first Step if none yet
  openStep(stepId: string): Step | undefined; // open in the panel; an unfinished Step becomes current
  getProgress(): Progress;                   // { doneSteps: string[], currentStep?: string }
  flush(): Promise<string | undefined>;      // wait for saves; a message if one failed
}
```

`loadTrack(folder, { checkRunner, readEnv, processEnv })` takes an optional Check runner, `.env` reader and fallback environment; tests inject fakes.

## Progress file

Progress lives in the Learner's agent workspace at `.touching-grass/progress.json`, so it is committed with their code. It is saved on every change (a Step done, the current Step moved).

```json
{
  "version": 1,
  "trackTitle": "Build an AI agent from scratch",
  "doneSteps": ["01-call-an-llm/1", "01-call-an-llm/2"],
  "currentStep": "01-call-an-llm/3",
  "skippedSteps": ["01-call-an-llm/2"],
  "chosenProvider": "claude"
}
```

- `trackTitle` identifies the Track. A file for another Track is ignored and copied to `progress.json.bak`.
- A file that is not valid (bad JSON, unknown `version`, wrong field types) is copied to `progress.json.bak` and progress starts fresh.
- Step ids that no longer exist in the Track are dropped on load.
- `skippedSteps` and `chosenProvider` are optional; files without them load fine.
- New fields are added to `ProgressFile` in `src/engine/progress.ts`.

The engine has no `vscode` import. The extension in `src/extension.ts` is a thin shell over it.
