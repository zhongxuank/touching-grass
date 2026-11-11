# touching-grass

A VSCode extension that walks a Learner through building real things by hand, one Step at a time. See `CONTEXT.md` for the vocabulary and `docs/adr/` for decisions. The Track file format is documented in `docs/track-format.md`.

## Run the extension locally from source

Requires Node 20+ and VS Code 1.90+.

```sh
npm install
npm run build
```

Then open this folder in VS Code and press F5 (the "Run Extension" launch config builds first). In the Extension Development Host, open the Touching Grass view in the activity bar, or run **Touching Grass: Open Track** from the command palette and pick a Track folder, for example `examples/sample-track`. Click a Step in the sidebar to open the Step panel.

## Development

```sh
npm run typecheck   # tsc, strict
npm test            # vitest engine unit tests
npm run validate-track -- <folder>  # check a Track folder (after npm run build); see docs/track-format.md
npm run test:smoke  # builds, then launches VS Code and checks the extension opens a fixture Track (downloads VS Code on first run)
```

## Draft a Track

In Claude Code, from this repo, run the project skill:

```
/draft-track build a CLI to-do list in Python, 2 Lessons
```

It asks a few questions if needed, plans the Lessons and Steps, writes `track.md`, `lessons/` and `checks/` in the format of `docs/track-format.md`, and runs `npm run validate-track` until it passes. The result is a draft: review and edit it before following it. See `examples/todo-track` for a drafted Track with its reference solution.
