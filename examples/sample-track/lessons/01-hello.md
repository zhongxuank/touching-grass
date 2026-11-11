---
title: Hello, Python
---
Get a first program running.

## Step: Print a greeting

A `print` call is the smallest program that proves your setup works.

```python file=hello/main.py
print("hello, world")
```

## Step: Wrap it in a function

checks: test_greet.py
habit: Small functions

Small functions are easier to test and reuse, so the greeting now lives in its own function.

```python file=hello/main.py
def greet(name: str) -> str:
    return f"hello, {name}"


print(greet("world"))
```

## Reflection

- Why is `greet` easier to test than a bare `print`?
