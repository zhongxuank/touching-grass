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

You need a key for one Provider, not all three. Steps for the Providers you have no key for are read-only, and their Checks are skipped. Lesson 1 shows you where the key goes: a `.env` file in your agent folder that git ignores.

| Provider | Cost for this Track | Notes |
| --- | --- | --- |
| [Anthropic (Claude)](https://console.anthropic.com/settings/keys) | A few cents. Claude Haiku 5.5 is $0.10 / $0.50 per million input / output tokens, roughly $0.0004 a call here, so $1 covers about 2,000 calls | Recommended. The Track's default for Claude |
| [OpenAI](https://platform.openai.com/api-keys) | A few cents with `gpt-4o-mini` | |
| [OpenRouter](https://openrouter.ai/keys), paid | A few cents with the default `openai/gpt-4o-mini` | One key for many models |
| [OpenRouter](https://openrouter.ai/keys), free | $0 | See below |

The whole Track makes roughly 50 to 150 calls, so the smallest top-up a Provider allows is plenty. These numbers are estimates from November 2026, so check the Provider's pricing page.

Keep it safe: create a key just for this, set a monthly spend limit in the Provider's console, never commit `.env`, and revoke the key when you are done.

**Free with OpenRouter.** OpenRouter has free models, with ids ending in `:free`. Put one in your agent folder's `.env`:

```sh
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=nvidia/nemotron-3.5-super-vl:free
```

Pick a free model that supports tool calling (filter by "Tools" on [openrouter.ai/models](https://openrouter.ai/models?max_price=0)), or Lesson 2's agent will not work. Free models allow 20 requests a minute and 50 a day (1,000 a day once you have bought $10 of credits), may be slower or less reliable, and can be withdrawn. Their providers may log prompts, so send nothing private. If a Check that calls the real API fails, try again or switch `OPENROUTER_MODEL` back to empty to use the paid default.

### 3. Install the extension

```sh
git clone https://github.com/zhongxuank/touching-grass
cd touching-grass
npm ci
npm run package
code --install-extension touching-grass.vsix
```

This installs touching grass into your normal VS Code, like any other extension. The Tracks come with it. To update later, run `git pull && npm ci && npm run package` and install the new `touching-grass.vsix` the same way.

(If `code` is not found, open VS Code, open the command palette and run **Shell Command: Install 'code' command in PATH**. Or run **Extensions: Install from VSIX...** and pick the file.)

### 4. Open your agent folder and the Track

1. Make an empty folder for the agent you are going to build, for example `~/my-agent`, and open it in VS Code (**File > Open Folder**). This window is where you work from now on.
2. Open the command palette (Ctrl+Shift+P, or Cmd+Shift+P on macOS) and run **Touching Grass: Open Track**. Pick **build-an-agent**.
3. Read the first Step, then press **Run Checks**. When it asks where you will write your code, pick **Use this window's folder**.

Read each Step's explanation, type the Code Chunk into the file it names, and press **Run Checks**. Your progress is saved in the agent folder. Next time you open that folder in VS Code, the Track reopens at the Step where you left off.

### 5. Ask Claude when you are stuck (optional)

Press **Ask Claude about this Step** at the bottom of any Step. It opens a terminal called "Claude tutor" in your agent folder, starts Claude Code there and asks it to read the Step you are on. Then ask your question in that terminal. Pressing the button again brings the same terminal back.

Claude acts as a Tutor, not as a pair programmer. When you choose your agent folder, the extension writes two files there that Claude Code reads:

- `.touching-grass/tutor.md` tells Claude how to help: explain, point to the cause of a failing Check, give a hint before a fix, and never type the Code Chunk for you or show the values in `.env`.
- `.touching-grass/current-step.md` is the Step you are on, with your last Check results. It is rewritten each time you open a Step or run its Checks.

To make Claude Code load the guide, the extension also adds one line, `@.touching-grass/tutor.md`, to `CLAUDE.md` in your agent folder. It creates that file if you have none, and otherwise keeps what you wrote. Delete the line to turn the Tutor guide off.

The Claude Code VS Code extension works too: because the window's folder is your agent folder, it starts there and reads the Tutor guide.

## Run the extension from source (for development)

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
