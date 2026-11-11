---
name: draft-track
description: Draft a Track for the Learner, or add Lessons to an existing Track. Use when the Learner wants to learn to build something by typing it (`/draft-track <goal>`).
---

Write a Track Draft: files the Learner reviews, then follows by typing each Code Chunk (ADR 0001, 0002). The extension only plays Tracks; this skill writes them. Vocabulary is `CONTEXT.md`; use its terms exactly.

[`docs/track-format.md`](../../../docs/track-format.md) is the contract for every file you write. Read it first and follow it exactly. Look at `examples/todo-track` for a finished Track.

## 1. Ask only what you need

The goal comes from `<goal>`. Ask the Learner (all in one message) only for what is missing and changes the plan: language, what they already know, roughly how many Lessons, and for an existing Track which Track folder to extend. A goal that already answers these needs no questions.

## 2. Plan

Plan before writing a file, and show the Learner the outline (Lessons, Step titles, Habits) in one message. Done when every Lesson has an ordered Step list and every Step names the file it writes.

- A Lesson is one concept. A Step is one small Code Chunk the Learner types in a few minutes.
- The Steps build one growing project in the Learner's workspace. The first Lesson starts with the setup Steps; every later Step extends files that exist.
- Pick 3 to 5 Habits for the Track. Tag a Step with `habit:` where its Code Chunk models one (the name matches `habits` exactly).
- Every Lesson ends with a Reflection of 1 or 2 "why" questions.

### Setup Steps (Python)

The first Lesson opens with Steps that make the workspace a uv project: `pyproject.toml` (with pytest settings so imports resolve), a `.gitignore` that ignores `.env`, and, when the Track uses an API key, a `.env.example` listing the key names with empty values. The explanation says why secrets stay out of the repository.

### Providers

Follow the Providers section of the track format for `provider:` Steps. The first Lesson that calls an LLM shows `claude`, `openai` and `openrouter` side by side, one Step each, and says one key is enough. Later Lessons write one Step per Provider only where the code differs; code that is identical for all Providers is a Step with no `provider:` line.

## 3. Write the files

`track.md`, `lessons/NN-name.md` and `checks/test_*.py`, as the format doc specifies. Rules the format doc cannot enforce:

- **Real, working code, never hidden.** Each Code Chunk is the actual code, complete enough to run. No stubs, no `...`, no TODO for the Learner to solve.
- **Explanation first.** Before each Code Chunk, explain what each part does and why, in plain words, so the Learner can understand the code line by line while typing it. Name any new concept the first time it appears.
- **One Code Chunk, one file per Step.** A later Step that changes an existing file shows the whole file again, and says in the explanation what is new. Prefer a new file per Step when the design allows it.
- **Cumulative.** A Step's Chunk is valid after all earlier Steps are typed, never before.

### Checks

A Check confirms the Learner's typed code works. It is not a quiz.

- A pytest file that imports the Learner's code from the workspace (`from app.config import KEY`). Name it `test_<what>.py`; list it in the Step's `checks:` line. A Step with no behaviour to check (config files) has no Check.
- Check behaviour and shape: return types, keys present, side effects on a `tmp_path`. Never exact text. Use `in`, `len`, `isinstance`, `!=` before and after.
- Keep Learner files untouched: write only to `tmp_path`.
- **Each Step's Checks pass against the code from all Steps so far.** A Check for Step 3 must not need Step 4's code and must still pass after Step 4 changes the file.
- Checks that call a real LLM use the cheapest model (for example `claude-haiku-4-5`, `gpt-4o-mini`, or an OpenRouter equivalent), keep max tokens small, and assert structure (a non-empty string, the tool-call shape, valid JSON), never wording. Name the Provider's Step with `provider:` so the Check is skipped without a key.

## 4. Verify

1. Keep a reference solution: the Learner workspace after the last Step, in `<track>/reference/`. Generate it from the Lessons so it cannot drift: `python3 -I .claude/skills/draft-track/extract-reference.py <track>` writes every Code Chunk to its `file=` path, later Steps overwriting earlier ones.
2. Run each Check the way the player does, from the reference folder:
   `PYTHONPATH=$PWD uv run --with pytest pytest -q <track>/checks/<file> --rootdir $PWD`
   When a Check needs an API key you do not have, say so and skip it. Remove `uv.lock`, `.venv` and `__pycache__` from `reference/` afterwards.
3. Run `npm run build` once, then `npm run validate-track -- <track>`. It prints `file:line: message` per problem. Fix every error and run it again. Done when it prints `OK`.

A Check that fails against the reference is a bug in the Check or in a Chunk: fix the file, then regenerate the reference.

## 5. Hand over

Tell the Learner the Track Draft is unreviewed: read it and edit the files before following it, since an LLM wrote it and can be wrong. Give the folder path, the Habits chosen, and which Steps need an API key. To follow it, they open the folder with **Touching Grass: Open Track**.
