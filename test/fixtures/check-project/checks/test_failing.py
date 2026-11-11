from greeting import greet


def test_greet_is_shouted():
    assert greet("world") == "HELLO, WORLD"
