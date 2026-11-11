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
npm run test:smoke  # builds, then launches VS Code and checks the extension opens a fixture Track (downloads VS Code on first run)
```
