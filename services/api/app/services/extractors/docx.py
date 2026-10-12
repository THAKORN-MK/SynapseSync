from __future__ import annotations

from io import BytesIO

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


def extract_docx(content: bytes) -> str:
    document = Document(BytesIO(content))
    blocks: list[str] = []
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            paragraph = Paragraph(child, document)
            if paragraph.text.strip():
                blocks.append(paragraph.text.strip())
        elif isinstance(child, CT_Tbl):
            table = Table(child, document)
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                if any(cells):
                    blocks.append(" | ".join(cells))
    return "\n\n".join(blocks).strip()
