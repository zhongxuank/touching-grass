import try_keywords


def write_notes(tmp_path):
    notes = tmp_path / "notes"
    notes.mkdir()
    (notes / "loop.md").write_text("# Loop\n\nThe agent loop calls the model again and again.")
    (notes / "tokens.md").write_text("# Tokens\n\nA token is about three quarters of a word.")


def test_main_prints_the_sources_of_matching_chunks(tmp_path, monkeypatch, capsys):
    write_notes(tmp_path)
    monkeypatch.chdir(tmp_path)
    try_keywords.main(["agent", "loop"])
    out = capsys.readouterr().out
    assert "loop.md" in out
    assert "tokens.md" not in out


def test_main_says_so_when_nothing_matches_and_has_a_default_question(tmp_path, monkeypatch, capsys):
    write_notes(tmp_path)
    monkeypatch.chdir(tmp_path)
    try_keywords.main(["zebra"])
    assert capsys.readouterr().out.strip()
    try_keywords.main([])
    assert "Loaded" in capsys.readouterr().out
