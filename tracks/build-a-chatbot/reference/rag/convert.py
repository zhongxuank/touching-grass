import re
from pathlib import Path

from pypdf import PdfReader


def pdf_text(path: Path) -> str:
    reader = PdfReader(path)
    return "\n\n".join(page.extract_text(extraction_mode="layout") for page in reader.pages)


def is_heading(line: str) -> bool:
    return len(line) < 60 and not line.endswith((".", ",", ":", ";", "!", "?"))


def clean(text: str) -> str:
    text = re.sub(r"(\w)-[ \t]*\n[ \t]*(\w)", r"\1\2", text)
    pieces = []
    for block in re.split(r"\n\s*\n", text):
        lines = [" ".join(line.split()) for line in block.splitlines() if line.strip()]
        if not lines or re.fullmatch(r"Page \d+", lines[0]):
            continue
        if is_heading(lines[0]):
            level = "#" if not pieces else "##"
            pieces.append(f"{level} {lines.pop(0)}")
        if lines:
            pieces.append(" ".join(lines))
    return "\n\n".join(pieces) + "\n"


def convert_all(sources: str = "sources", notes: str = "notes") -> list[Path]:
    folder = Path(sources)
    if not folder.is_dir():
        raise FileNotFoundError(f"No sources folder at {folder}. Copy the PDFs there first.")
    Path(notes).mkdir(exist_ok=True)
    written = []
    for pdf in sorted(folder.glob("*.pdf")):
        target = Path(notes) / f"{pdf.stem}.md"
        target.write_text(clean(pdf_text(pdf)), encoding="utf-8")
        written.append(target)
    return written


def main() -> None:
    for path in convert_all():
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
