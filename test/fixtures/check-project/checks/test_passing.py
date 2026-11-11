from greeting import greet


def test_greet_says_hello():
    assert greet("world") == "hello, world"
