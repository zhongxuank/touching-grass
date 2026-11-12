"""Verify a Track Step by Step, the way a Learner meets it.

For each Step in order, build a fresh workspace from Code Chunks 1..N (later
Steps overwrite earlier ones, like the Learner retyping a file), then run that
Step's Checks the way the player does. A Check must pass; a Check that
skips for lack of a key also exits 0 and counts as fine.

With no --provider the scenario is every Step. With --provider NAME, Steps
tagged for another Provider are left out, which is a Learner with one key who
read the other Provider Steps without typing them. Run all scenarios with
--all-providers. API keys are removed from the environment, so Checks that
need a key must skip.

A Track with `builds_on: <title>` in track.md starts every workspace from the
`reference/` of the sibling Track with that title (the project the Learner
already has), then adds Code Chunks 1..N on top.

Usage: python3 -I verify-steps.py <track> [--provider NAME | --all-providers]
Needs uv on PATH.
"""
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

PROVIDERS = ["claude", "openai", "openrouter"]
KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "LLM_PROVIDER"]


def base_reference(track):
    """The reference of the Track named by `builds_on:` in track.md, or None."""
    head = open(os.path.join(track, "track.md")).read().split("---")[1]
    m = re.search(r"^builds_on:\s*(.+?)\s*$", head, re.M)
    if not m:
        return None
    wanted = m.group(1).strip("\"'")
    parent = os.path.dirname(os.path.abspath(track))
    for other in sorted(glob.glob(os.path.join(parent, "*", "track.md"))):
        title = re.search(r"^title:\s*(.+?)\s*$", open(other).read().split("---")[1], re.M)
        if title and title.group(1).strip("\"'") == wanted:
            return os.path.join(os.path.dirname(other), "reference")
    sys.exit(f"builds_on: no Track titled {wanted!r} next to {track}")


def read_steps(track):
    lessons = re.findall(r"^\s*-\s*(lessons/\S+\.md)\s*$", open(os.path.join(track, "track.md")).read(), re.M)
    steps = []
    for lesson in lessons:
        text = open(os.path.join(track, lesson)).read()
        for position, section in enumerate(re.split(r"^## Step: ", text, flags=re.M)[1:], 1):
            title = section.splitlines()[0].strip()
            provider = re.search(r"^provider:\s*(\S+)", section, re.M)
            checks = re.search(r"^checks:\s*(.+)$", section, re.M)
            chunk = re.search(r"```\w+ file=(\S+)\n(.*?)```", section, re.S)
            steps.append(
                {
                    "id": f"{os.path.basename(lesson)[:-3]}/{position}",
                    "title": title,
                    "provider": provider.group(1) if provider else None,
                    "checks": [c.strip() for c in checks.group(1).split(",")] if checks else [],
                    "file": chunk.group(1),
                    "code": chunk.group(2),
                }
            )
    return steps


def run_scenario(track, steps, provider):
    scenario = [s for s in steps if s["provider"] in (None, provider)] if provider else steps
    env = {k: v for k, v in os.environ.items() if k not in KEYS}
    failed = 0
    base = base_reference(track)
    print(f"== scenario: {provider or 'every Step'}")
    for n, step in enumerate(scenario):
        ws = tempfile.mkdtemp(prefix="verify-")
        try:
            if base:
                shutil.copytree(base, ws, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".venv", "__pycache__", "uv.lock"))
            for earlier in scenario[: n + 1]:
                dest = os.path.join(ws, earlier["file"])
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                open(dest, "w").write(earlier["code"])
            if not step["checks"]:
                print(f"  - {step['id']} {step['title']}: no Checks")
                continue
            for check in step["checks"]:
                path = os.path.abspath(os.path.join(track, "checks", check))
                run_env = dict(env, PYTHONPATH=ws)
                result = subprocess.run(
                    ["uv", "run", "--with", "pytest", "pytest", "-q", path, "--rootdir", ws],
                    cwd=ws, env=run_env, capture_output=True, text=True,
                )
                summary = (result.stdout.strip().splitlines() or [""])[-1]
                ok = result.returncode == 0
                failed += 0 if ok else 1
                print(f"  {'ok  ' if ok else 'FAIL'} {step['id']} {check}: {summary}")
                if not ok:
                    print(result.stdout[-2000:], result.stderr[-1000:])
        finally:
            shutil.rmtree(ws, ignore_errors=True)
    return failed


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    track = args[0]
    steps = read_steps(track)
    if "--all-providers" in args and not any(s["provider"] for s in steps):
        scenarios = [None]  # no Provider Steps of its own, so one replay covers it
    elif "--all-providers" in args:
        scenarios = [None] + PROVIDERS
    elif "--provider" in args:
        scenarios = [args[args.index("--provider") + 1]]
    else:
        scenarios = [None]
    failed = sum(run_scenario(track, steps, p) for p in scenarios)
    print("FAILED" if failed else "OK", f"({failed} failing Checks)")
    sys.exit(1 if failed else 0)


main()
