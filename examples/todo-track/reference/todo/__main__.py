import sys

from todo.cli import main

for line in main(sys.argv[1:]):
    print(line)
