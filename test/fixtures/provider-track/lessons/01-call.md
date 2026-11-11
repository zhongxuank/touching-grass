---
title: Call an LLM
---
## Step: Set up

Start the project.

```python file=app/main.py
print("hi")
```

## Step: Call Claude

provider: claude
checks: test_claude.py

Call Claude.

```python file=app/claude_call.py
import os
KEY = os.environ["ANTHROPIC_API_KEY"]
```

## Step: Call OpenAI

provider: openai
checks: test_openai.py

Call OpenAI.

```python file=app/openai_call.py
import os
KEY = os.environ["OPENAI_API_KEY"]
```
