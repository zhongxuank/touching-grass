import sys

from agent.llm import ask


def main(args: list[str]) -> None:
    print(ask(" ".join(args) or "Say hello in five words."))


if __name__ == "__main__":
    main(sys.argv[1:])
