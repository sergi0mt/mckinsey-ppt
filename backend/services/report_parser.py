"""Parse a deepresearch report (.md / .pdf / .docx) into structured data.

The deepresearch agent emits Markdown with this structure (system prompt at
backend/app/api/agent.py L1546-1565 in sergi0mt/deepresearch):

    # {Title}
    ## Resumen Ejecutivo
    ## Marco Conceptual
    ## {N branch sections — H2}      ← these become MECE branches
    ## Brechas de Datos              ← optional
    ## Conclusiones
    ## Recomendaciones               ← sometimes merged with Conclusiones
    ## Notas de Confianza            ← optional
    ## Referencias / Bibliografía    ← [N] Title — URL
    ## Anexo Metodológico            ← optional

Citations are inline `[N]` (numeric only). The parser is permissive: any H2
not in the reserved-name set is treated as a branch.
"""
from __future__ import annotations
import io
import re
from dataclasses import dataclass, field
from pathlib import Path


# Reserved H2 section names (case-insensitive, ES + EN). Matched as substring.
_RESERVED_SECTIONS = {
    "resumen ejecutivo": "exec_summary",
    "executive summary": "exec_summary",
    "marco conceptual": "marco_conceptual",
    "conceptual framework": "marco_conceptual",
    "analytical framework": "marco_conceptual",
    "conclusiones": "conclusions",
    "conclusions": "conclusions",
    "recomendaciones": "recommendations",
    "recommendations": "recommendations",
    "brechas de datos": "data_gaps",
    "data gaps": "data_gaps",
    "notas de confianza": "confidence_notes",
    "confidence notes": "confidence_notes",
    "referencias": "references",
    "bibliografía": "references",
    "bibliografia": "references",
    "fuentes": "references",
    "references": "references",
    "sources": "references",
    "anexo metodológico": "methodology_annex",
    "anexo metodologico": "methodology_annex",
    "methodology": "methodology_annex",
    "metodología": "methodology_annex",
    "metodologia": "methodology_annex",
}


@dataclass
class ParsedReport:
    title: str
    exec_summary: str = ""
    marco_conceptual: str = ""
    branches: list[dict] = field(default_factory=list)   # [{question, content, citations: list[int]}]
    conclusions: str = ""
    recommendations: str = ""
    data_gaps: str = ""
    confidence_notes: str = ""
    references: list[dict] = field(default_factory=list)  # [{n, title, url}]
    methodology_annex: str = ""
    full_text: str = ""
    word_count: int = 0


def parse_report(filename: str, content: bytes) -> ParsedReport:
    """Dispatch by extension and return a ParsedReport.

    Robust to malformed input: if the content has no recognizable structure,
    returns a ParsedReport with title = filename stem and full_text populated.
    """
    ext = Path(filename).suffix.lower()
    if ext == ".md" or ext == ".markdown":
        text = content.decode("utf-8", errors="replace")
    elif ext == ".pdf":
        text = _extract_pdf_text(content)
    elif ext == ".docx":
        text = _extract_docx_text(content)
    elif ext == ".txt":
        text = content.decode("utf-8", errors="replace")
    else:
        raise ValueError(f"Unsupported format: {ext} (use .md, .pdf, .docx, or .txt)")

    return _parse_markdown_structure(text, fallback_title=Path(filename).stem)


def _extract_pdf_text(content: bytes) -> str:
    """Reuse the existing PDF ingestion pipeline."""
    from .pdf_ingestion import extract_pdf_content
    # extract_pdf_content takes a file path; write to a temp buffer-on-disk
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        result = extract_pdf_content(tmp_path)
        return result.get("text", "") if isinstance(result, dict) else str(result)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _extract_docx_text(content: bytes) -> str:
    """Convert .docx → plain text, preserving heading hierarchy as `## ` markers
    so the markdown parser can categorize sections."""
    try:
        from docx import Document
    except ImportError as e:
        raise ImportError("python-docx is required for .docx parsing — install via `pip install python-docx`") from e

    doc = Document(io.BytesIO(content))
    lines: list[str] = []
    for para in doc.paragraphs:
        text = (para.text or "").strip()
        if not text:
            lines.append("")
            continue
        style = (para.style.name or "").lower() if para.style else ""
        if "heading 1" in style or style == "title":
            lines.append(f"# {text}")
        elif "heading 2" in style:
            lines.append(f"## {text}")
        elif "heading 3" in style:
            lines.append(f"### {text}")
        else:
            lines.append(text)
    return "\n".join(lines)


def _parse_markdown_structure(md: str, fallback_title: str = "Untitled report") -> ParsedReport:
    """Walk the markdown, classify H2 sections, extract references."""
    md = md.replace("\r\n", "\n")
    lines = md.split("\n")

    # 1. Title = first line starting with `# ` (single hash)
    title = fallback_title
    for line in lines:
        s = line.strip()
        if s.startswith("# ") and not s.startswith("## "):
            title = s[2:].strip()
            break

    # 2. Walk H2 sections
    sections: list[tuple[str, str]] = []   # [(heading_text, body)]
    current_heading: str | None = None
    current_buf: list[str] = []
    for line in lines:
        if line.startswith("## ") and not line.startswith("### "):
            if current_heading is not None:
                sections.append((current_heading, "\n".join(current_buf).strip()))
            current_heading = line[3:].strip()
            current_buf = []
        elif current_heading is not None:
            current_buf.append(line)
    if current_heading is not None:
        sections.append((current_heading, "\n".join(current_buf).strip()))

    # 3. Categorize sections
    report = ParsedReport(title=title, full_text=md, word_count=len(md.split()))
    for heading, body in sections:
        if not body:
            continue
        category = _classify_heading(heading)
        if category == "exec_summary":
            report.exec_summary = body
        elif category == "marco_conceptual":
            report.marco_conceptual = body
        elif category == "conclusions":
            report.conclusions = body
        elif category == "recommendations":
            report.recommendations = body
        elif category == "data_gaps":
            report.data_gaps = body
        elif category == "confidence_notes":
            report.confidence_notes = body
        elif category == "methodology_annex":
            report.methodology_annex = body
        elif category == "references":
            report.references = _parse_references(body)
        else:
            # Treat as a branch
            citations = _extract_citation_numbers(body)
            report.branches.append({
                "question": heading,
                "content": body,
                "citations": citations,
            })

    return report


def _classify_heading(heading: str) -> str | None:
    """Return the reserved category key, or None if heading is a branch."""
    h = heading.lower().strip()
    # Strip markdown emphasis markers
    h = re.sub(r"[*_`#]", "", h).strip()
    for reserved, category in _RESERVED_SECTIONS.items():
        if reserved in h:
            return category
    return None


def _extract_citation_numbers(text: str) -> list[int]:
    """Find inline `[N]` citations and return unique numbers in order."""
    seen: set[int] = set()
    out: list[int] = []
    for m in re.finditer(r"\[(\d+)\]", text):
        n = int(m.group(1))
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


def _parse_references(body: str) -> list[dict]:
    """Parse `[N] Title — URL` lines (em-dash or hyphen)."""
    refs: list[dict] = []
    pattern = re.compile(
        r"^\s*[\-\*•]?\s*\[(\d+)\]\s+(.+?)\s+[—\-–]\s+(https?://\S+)",
        re.MULTILINE,
    )
    for m in pattern.finditer(body):
        refs.append({
            "n": int(m.group(1)),
            "title": m.group(2).strip(),
            "url": m.group(3).rstrip(".,;)"),
        })
    if not refs:
        # Fallback: any line starting with [N] that has a URL anywhere
        url_re = re.compile(r"https?://\S+")
        for line in body.split("\n"):
            line = line.strip().lstrip("-*• ")
            m = re.match(r"^\[(\d+)\]\s+(.+)", line)
            if m:
                rest = m.group(2)
                url_match = url_re.search(rest)
                url = url_match.group(0).rstrip(".,;)") if url_match else ""
                title = url_re.sub("", rest).strip(" —–-:.,")
                refs.append({"n": int(m.group(1)), "title": title, "url": url})
    return refs
