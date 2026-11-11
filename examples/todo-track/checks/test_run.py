import os
import subprocess
import sys


def test_package_runs_as_a_module(tmp_path):
    # Run in a temp folder so the Learner's real tasks.json is never touched.
    result = subprocess.run(
        [sys.executable, "-m", "todo", "list"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": os.getcwd()},
    )
    assert result.returncode == 0
