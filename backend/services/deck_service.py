"""Bridge between the web app and the mckinsey_pptx library.

Handles normalization of AI-generated JSON field names to match
the Pydantic model schemas expected by slide_builder.py.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from datetime import datetime

# Ensure mckinsey_pptx is importable
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from mckinsey_pptx.deck_assembler import quick_deck
from mckinsey_pptx.validators import validate_slides, ValidationReport
from mckinsey_pptx.models import SlideContent, BulletPoint, ChartSpec, ChartDataSeries, TableSpec


def _normalize_chart(chart_data: dict) -> dict | None:
    """Normalize AI-generated chart JSON to match ChartSpec schema.

    AI may produce:
      {"chart_type": "pie", "labels": [...], "data": [...], "source": "...", "so_what": "..."}
    But ChartSpec expects:
      {"chart_type": "pie", "categories": [...], "series": [{"name": "...", "values": [...]}], ...}
    """
    if not chart_data or not isinstance(chart_data, dict):
        return None

    chart_type = chart_data.get("chart_type", "")

    # Normalize chart_type aliases
    type_aliases = {
        "bar": "bar_vertical",
        "horizontal_bar": "bar_horizontal",
        "stacked": "stacked_bar",
        "grouped": "grouped_bar",
        "pie_chart": "pie",
        "line_chart": "line",
    }
    chart_type = type_aliases.get(chart_type, chart_type)
    chart_data["chart_type"] = chart_type

    # Normalize categories: "labels" → "categories"
    if "labels" in chart_data and "categories" not in chart_data:
        chart_data["categories"] = chart_data.pop("labels")

    # Normalize series: "data" (flat array) → "series" (list of ChartDataSeries)
    if "data" in chart_data and "series" not in chart_data:
        data = chart_data.pop("data")
        if isinstance(data, list) and data:
            chart_data["series"] = [{"name": "Data", "values": [float(v) if v is not None else 0 for v in data]}]
    elif "values" in chart_data and "series" not in chart_data:
        values = chart_data.pop("values")
        if isinstance(values, list):
            chart_data["series"] = [{"name": "Data", "values": [float(v) if v is not None else 0 for v in values]}]

    # Normalize series items: ensure each series has proper structure
    if "series" in chart_data and isinstance(chart_data["series"], list):
        normalized_series = []
        for s in chart_data["series"]:
            if isinstance(s, dict):
                name = s.get("name", "Series")
                values = s.get("values", s.get("data", []))
                # Ensure values are floats
                try:
                    values = [float(v) if v is not None else 0 for v in values]
                except (TypeError, ValueError):
                    values = []
                if values:
                    normalized_series.append({"name": name, "values": values})
        chart_data["series"] = normalized_series

    # Ensure categories exist and match series length
    if chart_data.get("series") and not chart_data.get("categories"):
        first_series = chart_data["series"][0]
        n = len(first_series.get("values", []))
        chart_data["categories"] = [f"Item {i+1}" for i in range(n)]

    # Validate: must have both categories and series with data
    cats = chart_data.get("categories", [])
    series = chart_data.get("series", [])
    if not cats or not series or not any(s.get("values") for s in series):
        return None

    return chart_data


def _normalize_agenda(sd: dict) -> dict:
    """Normalize agenda slide: extract agenda_items from bullets if needed."""
    if sd.get("agenda_items"):
        # Already has agenda_items — normalize to plain strings
        items = []
        for item in sd["agenda_items"]:
            if isinstance(item, str):
                items.append(item)
            elif isinstance(item, dict):
                items.append(item.get("text", str(item)))
        sd["agenda_items"] = items
        return sd

    # Try to extract from bullets
    if sd.get("bullets"):
        items = []
        for b in sd["bullets"]:
            if isinstance(b, str):
                # Strip markdown bold: "**I. Diagnosis:** Problem..." → "I. Diagnosis: Problem..."
                clean = re.sub(r'\*\*([^*]+)\*\*', r'\1', b).strip()
                items.append(clean)
            elif isinstance(b, dict):
                prefix = b.get("bold_prefix", "")
                text = b.get("text", "")
                items.append(f"{prefix} {text}".strip() if prefix else text)
        if items:
            sd["agenda_items"] = items
            sd.pop("bullets", None)

    return sd


def _normalize_next_steps(sd: dict) -> dict:
    """Normalize next_steps slide: extract action_items from bullets if needed."""
    if sd.get("action_items"):
        return sd

    # Try to extract from bullets
    if sd.get("bullets"):
        items = []
        for b in sd["bullets"]:
            text = ""
            if isinstance(b, str):
                text = re.sub(r'\*\*([^*]+)\*\*', r'\1', b).strip()
            elif isinstance(b, dict):
                prefix = b.get("bold_prefix", "")
                body = b.get("text", "")
                text = f"{prefix} {body}".strip() if prefix else body

            if text:
                # Try to split "Día 30: Do something" into action/timeline
                match = re.match(r'^((?:Día|Day|Week|Month|Phase|Step)\s+\d+\S*)\s*[:\-]\s*(.+)', text, re.IGNORECASE)
                if match:
                    items.append({
                        "action": match.group(2).strip(),
                        "owner": "TBD",
                        "timeline": match.group(1).strip(),
                    })
                else:
                    items.append({
                        "action": text,
                        "owner": "TBD",
                        "timeline": "TBD",
                    })

        if items:
            sd["action_items"] = items
            sd.pop("bullets", None)

    return sd


def _parse_markdown_bold(text: str) -> dict:
    """Parse markdown **bold:** prefix from a plain text bullet.

    "**CUI Obligatorio:** Repositorio único..." →
    {"bold_prefix": "CUI Obligatorio:", "text": "Repositorio único..."}

    If no markdown bold found, returns {"text": original_text}
    """
    match = re.match(r'^\*\*([^*]+)\*\*\s*(.*)', text)
    if match:
        prefix = match.group(1).strip()
        rest = match.group(2).strip()
        return {"bold_prefix": prefix, "text": rest}
    return {"text": text}


def slides_json_to_content(slides_data: list[dict]) -> list[SlideContent]:
    """Convert slide JSON dicts (from DB) to SlideContent objects.

    Handles normalization of AI-generated field names to match Pydantic models:
    - chart.labels → chart.categories; chart.data → chart.series
    - agenda bullets → agenda_items
    - next_steps bullets → action_items[{action, owner, timeline}]
    - **markdown bold** → bold_prefix field
    """
    result = []
    for sd in slides_data:
        slide_type = sd.get("slide_type", "content_text")

        # ── Normalize agenda ──
        if slide_type == "agenda":
            sd = _normalize_agenda(sd)

        # ── Normalize next_steps ──
        if slide_type == "next_steps":
            sd = _normalize_next_steps(sd)

        # ── Normalize bullets (parse markdown **bold:** → bold_prefix field) ──
        if "bullets" in sd and sd["bullets"]:
            normalized_bullets = []
            for b in sd["bullets"]:
                if isinstance(b, str):
                    # Parse markdown bold from plain text: "**Key:** value" → bold_prefix + text
                    parsed = _parse_markdown_bold(b)
                    normalized_bullets.append(BulletPoint(**parsed))
                elif isinstance(b, dict) and "text" in b:
                    # If text contains markdown bold but no bold_prefix, parse it
                    if not b.get("bold_prefix") and "**" in b.get("text", ""):
                        parsed = _parse_markdown_bold(b["text"])
                        b = {**b, **parsed}
                    normalized_bullets.append(BulletPoint(**b))
                elif isinstance(b, dict):
                    normalized_bullets.append(BulletPoint(text=str(b.get("text", b))))
                else:
                    normalized_bullets.append(BulletPoint(text=str(b)))
            sd["bullets"] = normalized_bullets

        # ── Normalize chart ──
        if "chart" in sd and isinstance(sd.get("chart"), dict):
            normalized = _normalize_chart(sd["chart"])
            if normalized:
                try:
                    sd["chart"] = ChartSpec(**normalized)
                except Exception:
                    # Chart data invalid even after normalization → convert to text slide
                    so_what = sd["chart"].get("so_what", "")
                    sd.pop("chart")
                    if so_what and not sd.get("bullets"):
                        sd["bullets"] = [BulletPoint(text=so_what)]
                    sd["slide_type"] = "content_text"
            else:
                # No valid chart data → convert to text slide with so_what as bullet
                so_what = sd["chart"].get("so_what", "") if isinstance(sd["chart"], dict) else ""
                source = sd["chart"].get("source", "") if isinstance(sd["chart"], dict) else ""
                sd.pop("chart")
                fallback_bullets = []
                if so_what:
                    fallback_bullets.append(BulletPoint(bold_prefix="Key insight:", text=so_what))
                if source:
                    sd["source"] = source
                if fallback_bullets:
                    sd["bullets"] = fallback_bullets
                sd["slide_type"] = "content_text"

        # ── Normalize table ──
        if "table" in sd and isinstance(sd.get("table"), dict):
            try:
                sd["table"] = TableSpec(**sd["table"])
            except Exception:
                sd.pop("table")
                sd["slide_type"] = "content_text"

        # ── Create SlideContent ──
        try:
            result.append(SlideContent(**sd))
        except Exception:
            # Last resort: minimal text slide preserving the title
            safe = {
                "slide_type": "content_text",
                "action_title": sd.get("action_title", "Slide"),
            }
            # Try to preserve any bullets
            if sd.get("bullets"):
                safe["bullets"] = sd["bullets"] if isinstance(sd["bullets"][0], BulletPoint) else [
                    BulletPoint(text=str(b)) for b in sd["bullets"]
                ]
            result.append(SlideContent(**safe))

    return result


def _pre_normalize_slides(slides_data: list[dict]) -> list[dict]:
    """Pre-normalize all slide dicts before passing to quick_deck.

    This runs the same normalization as slides_json_to_content but returns
    raw dicts (not Pydantic objects) so quick_deck can consume them.
    """
    import copy
    normalized = []
    for sd in slides_data:
        sd = copy.deepcopy(sd)  # Don't mutate the original
        slide_type = sd.get("slide_type", "content_text")

        # Normalize agenda
        if slide_type == "agenda":
            sd = _normalize_agenda(sd)

        # Normalize next_steps
        if slide_type == "next_steps":
            sd = _normalize_next_steps(sd)

        # Normalize chart
        if "chart" in sd and isinstance(sd.get("chart"), dict):
            normalized_chart = _normalize_chart(sd["chart"])
            if normalized_chart:
                sd["chart"] = normalized_chart
            else:
                # No valid chart data → fallback: add so_what as bullet
                so_what = sd["chart"].get("so_what", "") if isinstance(sd["chart"], dict) else ""
                source = sd["chart"].get("source", "") if isinstance(sd["chart"], dict) else ""
                sd.pop("chart")
                fallback_bullets = sd.get("bullets", [])
                if so_what:
                    fallback_bullets.append({"bold_prefix": "Key insight:", "text": so_what})
                if source:
                    sd["source"] = source
                sd["bullets"] = fallback_bullets
                sd["slide_type"] = "content_text"

        # Parse markdown **bold:** in plain string bullets → bold_prefix + text dicts
        if "bullets" in sd and sd["bullets"]:
            parsed_bullets = []
            for b in sd["bullets"]:
                if isinstance(b, str):
                    parsed_bullets.append(_parse_markdown_bold(b))
                elif isinstance(b, dict) and not b.get("bold_prefix") and "**" in b.get("text", ""):
                    parsed_bullets.append({**b, **_parse_markdown_bold(b["text"])})
                else:
                    parsed_bullets.append(b)
            sd["bullets"] = parsed_bullets

        normalized.append(sd)
    return normalized


def generate_pptx(
    slides_data: list[dict],
    title: str = "McKinsey Presentation",
    client: str = "",
    date: str = "",
    output_dir: str | Path = "output",
    project_id: str = "",
) -> tuple[Path, ValidationReport]:
    """Generate a .pptx file from slide data.

    Returns (filepath, validation_report).
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"deck_{project_id[:8]}_{timestamp}.pptx"
    output_path = output_dir / filename

    # PRE-NORMALIZE: fix field name mismatches before quick_deck processes them
    normalized_data = _pre_normalize_slides(slides_data)

    # Generate the deck (quick_deck prints validation and returns path)
    import io
    from contextlib import redirect_stdout

    # Capture validation output
    f = io.StringIO()
    with redirect_stdout(f):
        result_path = quick_deck(
            title=title,
            client=client,
            date=date or datetime.now().strftime("%B %Y"),
            slides_data=normalized_data,
            output_path=str(output_path),
        )

    # Run validation separately to get the report object
    contents = slides_json_to_content(slides_data)
    report = validate_slides(contents)

    return Path(result_path), report


def validate_project_slides(slides_data: list[dict]) -> dict:
    """Validate slides and return structured report."""
    contents = slides_json_to_content(slides_data)
    report = validate_slides(contents)
    return {
        "score": report.score,
        "passed": report.passed,
        "errors": [
            {"rule": i.rule, "message": i.message, "slide_index": i.slide_index,
             "suggestion": i.suggestion}
            for i in report.errors
        ],
        "warnings": [
            {"rule": i.rule, "message": i.message, "slide_index": i.slide_index,
             "suggestion": i.suggestion}
            for i in report.warnings
        ],
        "summary": report.summary(),
    }
