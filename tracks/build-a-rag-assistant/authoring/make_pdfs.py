"""Rebuild ../assets/pdfs/*.pdf from source/*.md.

The PDFs are what the Learner's Lesson 1 converts into Markdown notes. This script is only for the Track's
author: it is not shipped in the extension. Needs `pip install reportlab pyphen`.

Source format: `# Title`, `## Heading`, and paragraphs separated by blank lines. Plain text only.

Usage: python3 make_pdfs.py
"""
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

HERE = Path(__file__).resolve().parent

TITLE = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=22, leading=28, spaceAfter=16)
HEADING = ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=14, leading=18, spaceBefore=14, spaceAfter=6)
BODY = ParagraphStyle(
    "body",
    fontName="Helvetica",
    fontSize=11,
    leading=16,
    spaceAfter=8,
    alignment=TA_JUSTIFY,
    hyphenationLang="en_GB",  # breaks long words at line ends with a "-", as real PDFs often do
    hyphenationMinWordLength=8,
)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.drawCentredString(A4[0] / 2, 1.2 * cm, f"Page {doc.page}")
    canvas.restoreState()


def build(source: Path, target: Path) -> None:
    story = []
    title = source.stem
    for block in source.read_text(encoding="utf-8").strip().split("\n\n"):
        block = " ".join(block.split())
        if block.startswith("## "):
            story.append(Paragraph(escape(block[3:]), HEADING))
        elif block.startswith("# "):
            title = block[2:]
            story.append(Paragraph(escape(title), TITLE))
        else:
            story.append(Paragraph(escape(block), BODY))
    story.append(Spacer(1, 6))
    doc = SimpleDocTemplate(
        str(target),
        pagesize=A4,
        leftMargin=2.5 * cm,
        rightMargin=2.5 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
        title=title,
        author="touching grass",
        invariant=True,  # fixed dates and ids, so rebuilding gives identical files
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    out = HERE.parent / "assets" / "pdfs"
    out.mkdir(exist_ok=True)
    for md in sorted((HERE / "source").glob("*.md")):
        build(md, out / f"{md.stem}.pdf")
        print("wrote", out / f"{md.stem}.pdf")
