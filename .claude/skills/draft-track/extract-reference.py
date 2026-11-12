import re, glob, os, shutil, sys
track = sys.argv[1]
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


base = base_reference(track)
if base:
    shutil.copytree(base, ref, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".venv", "__pycache__", "uv.lock"))
    print("started from", base)
files = {}
for f in sorted(glob.glob(os.path.join(track, "lessons", "*.md"))):
    for m in re.finditer(r"```\w+ file=(\S+)\n(.*?)```", open(f).read(), re.S):
        files[m.group(1)] = m.group(2)
for p, c in files.items():
    dest = os.path.join(ref, p)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w").write(c)
    print("wrote", dest)
