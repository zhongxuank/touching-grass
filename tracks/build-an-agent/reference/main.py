import logging

from agent.run import run_agent

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

if __name__ == "__main__":
    print(run_agent("What time is it in UTC, and what is 1234 plus 5678?"))
