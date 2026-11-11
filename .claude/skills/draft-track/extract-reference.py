import re, glob, os, sys
track = sys.argv[1]
ref = os.path.join(track, "reference")
files = {}
for f in sorted(glob.glob(os.path.join(track, "lessons", "*.md"))):
    for m in re.finditer(r"```\w+ file=(\S+)\n(.*?)```", open(f).read(), re.S):
        files[m.group(1)] = m.group(2)
for p, c in files.items():
    dest = os.path.join(ref, p)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w").write(c)
    print("wrote", dest)
