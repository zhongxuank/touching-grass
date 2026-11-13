"""Write a Track's reference solution: the Learner workspace after the last Step.

Starts from the `builds_on:` Track's reference (if any), applies each Step's `copy:` line (the files a button
copies for the Learner), then writes every Code Chunk to its `file=` path, later Steps overwriting earlier ones.

Some files are made by running the Learner's code (for example notes converted from PDFs). Pass
`--run "<command>"` (repeatable) to run a command in the reference folder after everything is written.

Usage: python3 -I extract-reference.py <track> [--run "uv run python -m rag.convert"]
"""
import re, glob, os, shutil, subprocess, sys
args = sys.argv[1:]
run_commands = [args[i + 1] for i, a in enumerate(args) if a == "--run"]
track = args[0]
ref = os.path.join(track, "reference")


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


def copy_step_files(track, section, dest_root):
    """Apply a Step's `copy: <track folder> -> <workspace folder>` line, never overwriting a file."""
    m = re.search(r"^copy:\s*(.+?)\s*->\s*(.+?)\s*$", section, re.M)
    if not m:
        return
    src = os.path.join(track, m.group(1))
    dst = os.path.join(dest_root, m.group(2))
    for root, _dirs, names in os.walk(src):
        for name in names:
            target = os.path.join(dst, os.path.relpath(os.path.join(root, name), src))
            if not os.path.exists(target):
                os.makedirs(os.path.dirname(target), exist_ok=True)
                shutil.copyfile(os.path.join(root, name), target)
                print("copied", target)


base = base_reference(track)
if base:
    shutil.copytree(base, ref, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".venv", "__pycache__", "uv.lock"))
    print("started from", base)
files = {}
for f in sorted(glob.glob(os.path.join(track, "lessons", "*.md"))):
    text = open(f).read()
    for section in re.split(r"^## Step: ", text, flags=re.M)[1:]:
        copy_step_files(track, section, ref)
    for m in re.finditer(r"```\w+ file=(\S+)\n(.*?)```", text, re.S):
        files[m.group(1)] = m.group(2)
for p, c in files.items():
    dest = os.path.join(ref, p)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w").write(c)
    print("wrote", dest)
for command in run_commands:
    print("running", command)
    subprocess.run(command, shell=True, cwd=ref, check=True)
