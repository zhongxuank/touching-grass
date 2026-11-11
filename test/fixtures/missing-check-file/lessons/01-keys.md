---
title: Keys
---
## Step: Read the key

provider: claude
checks: test_present.py, test_missing.py

Keep secrets in `.env`, never in code.

```python file=app/config.py
import os
KEY = os.environ["ANTHROPIC_API_KEY"]
```
