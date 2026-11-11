---
title: First Lesson
---
Intro to the first Lesson.

## Step: Say hello

Print a greeting so you know the project runs.

```python file=app/main.py
print("hello")
```

## Step: Read a key

provider: claude
checks: test_key.py

Keep secrets in `.env`, never in code.

```python file=app/config.py
import os
KEY = os.environ["ANTHROPIC_API_KEY"]
```

## Reflection

- Why keep the key out of the source file?
