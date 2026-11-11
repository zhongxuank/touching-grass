# touching-grass

A VSCode extension that walks a Learner through building real things by hand, one Step at a time. See `CONTEXT.md` for the vocabulary and `docs/adr/` for decisions. The Track file format is documented in `docs/track-format.md`.

## Set up before you start

Do these once, in order. It takes about 15 minutes.

### 1. Install the tools

| Tool | Why | Install |
| --- | --- | --- |
| [VS Code](https://code.visualstudio.com/) 1.90+ | Runs the extension | Download from the site |
| [Node.js](https://nodejs.org/) 20+ and git | Builds the extension | Download from the site, or your package manager |
| [uv](https://docs.astral.sh/uv/) | Runs your Python and the Checks. It installs Python for you | macOS / Linux: `curl -LsSf https://astral.sh/uv/install.sh \| sh`<br>Windows: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| [Claude Code](https://code.claude.com/docs) (optional) | Your Tutor: answers questions about the Step you are on | `npm install -g @anthropic-ai/claude-code`, then run `claude` once to sign in |

Check them in a new terminal: `code --version`, `node --version`, `uv --version`, and `claude --version` if you installed it.

### 2. Get one API key

You need a key for one Provider, not all three: [Anthropic (Claude)](https://console.anthropic.com/settings/keys), [OpenAI](https://platform.openai.com/api-keys) or [OpenRouter](https://openrouter.ai/keys). Keep it somewhere safe for now. Lesson 1 shows you where it goes (a `.env` file in your agent folder that git ignores). Steps for the Providers you have no key for are read-only, and their Checks are skipped.

### 3. Build and launch the extension

```sh
git clone https://github.com/zhongxuank/touching-grass
cd touching-grass
npm ci
npm run build
code .
```

In VS Code, press **F5**. A second window opens, titled "Extension Development Host". Everything below happens in that window.

### 4. Open the Track and your agent folder

1. Make an empty folder for the agent you are going to build, for example `~/my-agent`. Keep it outside this repo.
2. Open the command palette (Ctrl+Shift+P, or Cmd+Shift+P on macOS) and run **Touching Grass: Open Track**. Pick `tracks/build-an-agent` in this repo.
3. Run **Touching Grass: Choose Agent Workspace** and pick your empty folder.

The first Step opens. Read the explanation, type the Code Chunk into the file it names, and press **Run Checks**. Your progress is saved in the agent folder, so next time you open the same Track and folder you continue where you left off.

### 5. Ask Claude when you are stuck (optional)

Press **Ask Claude about this Step** at the bottom of any Step. It opens a terminal called "Claude tutor" in your agent folder, starts Claude Code there and asks it to read the Step you are on. Then ask your question in that terminal. Pressing the button again brings the same terminal back.

Claude acts as a Tutor, not as a pair programmer. When you choose your agent folder, the extension writes two files there that Claude Code reads:

- `.touching-grass/tutor.md` tells Claude how to help: explain, point to the cause of a failing Check, give a hint before a fix, and never type the Code Chunk for you or show the values in `.env`.
- `.touching-grass/current-step.md` is the Step you are on, with your last Check results. It is rewritten each time you open a Step or run its Checks.

To make Claude Code load the guide, the extension also adds one line, `@.touching-grass/tutor.md`, to `CLAUDE.md` in your agent folder. It creates that file if you have none, and otherwise keeps what you wrote. Delete the line to turn the Tutor guide off.

If you use the Claude Code VS Code extension instead of the terminal, open your agent folder as the window's folder first, so that Claude Code starts there.

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
