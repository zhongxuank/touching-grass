import logging
import sys

from agent.run import run_agent

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) or "Using my notes, why does a model lose track of the start of a long conversation?"
    print(run_agent(question))
