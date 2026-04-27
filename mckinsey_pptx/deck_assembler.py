"""
Deck assembler: full pipeline from Storyline → .pptx file.
Orchestrates slide building, numbering, validation, and final output.
Runs McKinsey methodology validators automatically before save.
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional

from pptx import Presentation
from pptx.util import Inches

from .config import LAYOUT
from .models import Deck, SlideContent, SlideType
from .slide_builder import build_slide
from .storyline import storyline_to_slides
from .validators import validate_deck, validate_slides, ValidationReport


def create_presentation() -> Presentation:
    """Create a new blank 16:9 presentation."""
    prs = Presentation()
    prs.slide_width = LAYOUT.WIDTH
    prs.slide_height = LAYOUT.HEIGHT
    return prs


def assemble_deck(deck: Deck, output_path: str | Path,
                  validate: bool = True) -> tuple[Path, ValidationReport | None]:
    """Assemble a complete McKinsey-style deck and save to .pptx.

    Runs validators automatically unless validate=False.

    Args:
        deck: The complete Deck model with storyline and slides.
        output_path: Path to save the .pptx file.
        validate: Whether to run McKinsey methodology validators.

    Returns:
        Tuple of (path to saved file, ValidationReport or None).
    """
    output_path = Path(output_path)

    # Run validators
    report = None
    if validate:
        report = validate_deck(deck)
        print(report.summary())
        print()

    prs = create_presentation()
    all_slides = deck.get_slide_sequence()

    for i, slide_content in enumerate(all_slides):
        page_num = i
        build_slide(
            prs, slide_content,
            page_num=page_num,
            client=deck.client or "",
            date=deck.date or "",
            confidential=deck.confidential,
        )

    prs.save(str(output_path))
    return output_path, report


def assemble_from_storyline(
    storyline,
    sections: list[dict],
    title: str,
    client: str = "",
    date: str = "",
    confidential: bool = True,
    appendix_slides: list[SlideContent] | None = None,
    output_path: str | Path = "output.pptx",
) -> Path:
    """High-level: build a deck from a Storyline + section content → .pptx.

    Args:
        storyline: A Storyline object from storyline.py.
        sections: List of section dicts with title and slides.
        title: Deck title.
        client: Client name.
        date: Date string.
        confidential: Whether to show confidentiality notice.
        appendix_slides: Optional appendix slides.
        output_path: Where to save the .pptx.

    Returns:
        Path to the saved file.
    """
    slides = storyline_to_slides(storyline, sections)

    deck = Deck(
        title=title,
        client=client,
        date=date,
        confidential=confidential,
        storyline=storyline,
        slides=slides,
        appendix_slides=appendix_slides or [],
    )

    return assemble_deck(deck, output_path)


def quick_deck(
    title: str,
    slides_data: list[dict],
    client: str = "",
    date: str = "",
    output_path: str | Path = "output.pptx",
) -> Path:
    """Simplified deck builder — skip storyline, just provide slides directly.

    Each dict in slides_data should map to SlideContent fields.
    Useful for quick prototyping without the full questionnaire flow.

    Example:
        quick_deck(
            title="Market Entry Analysis",
            slides_data=[
                {"slide_type": "title", "action_title": "Should We Enter LatAm?",
                 "subtitle": "Strategic Assessment — April 2026"},
                {"slide_type": "content_text",
                 "action_title": "LatAm represents a $50B addressable market growing at 12% CAGR",
                 "bullets": [{"text": "Brazil and Mexico account for 65% of regional GDP"},
                             {"text": "Digital adoption doubled since 2020"}]},
            ],
            output_path="quick_output.pptx",
        )
    """
    prs = create_presentation()
    constructed_slides = []

    for i, slide_data in enumerate(slides_data):
        # Convert bullet dicts to BulletPoint objects if needed
        if "bullets" in slide_data:
            from .models import BulletPoint
            slide_data["bullets"] = [
                BulletPoint(**b) if isinstance(b, dict)
                else BulletPoint(text=str(b)) if isinstance(b, str)
                else b
                for b in slide_data["bullets"]
            ]

        # Convert chart dict to ChartSpec if needed — with fallback for unknown types
        if "chart" in slide_data and isinstance(slide_data["chart"], dict):
            from .models import ChartSpec, ChartType
            chart_data = slide_data["chart"]
            valid_types = {e.value for e in ChartType}
            raw_type = chart_data.get("chart_type", "")
            if raw_type not in valid_types:
                # Map common AI-generated types to valid ones, or drop chart
                _chart_fallback = {
                    "process_flow": "bar_horizontal",
                    "process_flow_conceptual": "bar_horizontal",
                    "funnel": "bar_horizontal",
                    "timeline": "bar_horizontal",
                    "radar": "bar_vertical",
                    "donut": "pie",
                    "area": "line",
                    "heatmap": "matrix_2x2",
                    "table_chart": "bar_vertical",
                    "sankey": "stacked_bar",
                    "gauge": "harvey_balls",
                }
                mapped = _chart_fallback.get(raw_type)
                if mapped:
                    chart_data["chart_type"] = mapped
                    print(f"  [chart] Mapped unsupported '{raw_type}' -> '{mapped}' for slide {i}")
                else:
                    # Can't map — convert slide to content_text with chart info as bullets
                    print(f"  [chart] Dropping unsupported chart type '{raw_type}' for slide {i}, converting to text")
                    so_what = chart_data.get("so_what", "")
                    source = chart_data.get("source", "")
                    extra_bullets = []
                    if so_what:
                        extra_bullets.append({"text": so_what})
                    if source:
                        extra_bullets.append({"text": f"Source: {source}"})
                    slide_data.pop("chart")
                    slide_data["slide_type"] = "content_text"
                    existing = slide_data.get("bullets", [])
                    slide_data["bullets"] = existing + extra_bullets if existing else extra_bullets
                    # Re-normalize bullets
                    from .models import BulletPoint
                    slide_data["bullets"] = [
                        BulletPoint(**b) if isinstance(b, dict)
                        else BulletPoint(text=str(b)) if isinstance(b, str)
                        else b
                        for b in slide_data["bullets"]
                    ]
            if "chart" in slide_data:
                try:
                    slide_data["chart"] = ChartSpec(**chart_data)
                except Exception as e:
                    print(f"  [chart] ChartSpec validation failed for slide {i}: {e}. Converting to text.")
                    slide_data.pop("chart")
                    slide_data["slide_type"] = "content_text"

        # Convert table dict to TableSpec if needed
        if "table" in slide_data and isinstance(slide_data["table"], dict):
            from .models import TableSpec
            try:
                slide_data["table"] = TableSpec(**slide_data["table"])
            except Exception as e:
                print(f"  [table] TableSpec validation failed for slide {i}: {e}. Dropping table.")
                slide_data.pop("table")
                slide_data["slide_type"] = "content_text"

        content = SlideContent(**slide_data)
        constructed_slides.append(content)
        build_slide(
            prs, content,
            page_num=i,
            client=client,
            date=date,
        )

    # Run McKinsey methodology validators
    report = validate_slides(constructed_slides)
    print(report.summary())
    print()

    output_path = Path(output_path)
    prs.save(str(output_path))
    return output_path
