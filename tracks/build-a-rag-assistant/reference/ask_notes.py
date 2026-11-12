import sys

from rag.answer import answer_question


def main(args: list[str], **kwargs) -> None:
    question = " ".join(args) or "What happens when a conversation fills the context window?"
    result = answer_question(question, **kwargs)
    print(result.text)
    print(f"\nSources: {', '.join(result.sources) or 'none'} (best score {result.best_score:.2f})")


if __name__ == "__main__":
    main(sys.argv[1:])
