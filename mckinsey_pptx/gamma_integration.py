"""
Gamma MCP integration: converts McKinsey storylines to Gamma-compatible format.
Use with the Gamma MCP tool for rapid presentation generation.
"""
from __future__ import annotations
from .models import Storyline, SlideContent, SlideType, Deck


def storyline_to_gamma_input(storyline: Storyline, sections: list[dict] = None) -> str:
    """Convert a Storyline to Gamma inputText format.

    Produces structured text that Gamma can expand into a presentation
    while preserving McKinsey methodology.
    """
    lines = []

    # Title & context
    lines.append(f"# {storyline.central_question}")
    lines.append("")

    # Executive Summary (SCR)
    lines.append("## Executive Summary")
    lines.append("")
    lines.append(f"**Situation:** {storyline.scr.situation}")
    lines.append("")
    lines.append(f"**Complication:** {storyline.scr.complication}")
    lines.append("")
    lines.append(f"**Resolution:** {storyline.scr.resolution}")
    lines.append("")

    # Key recommendation
    lines.append(f"**Key Recommendation:** {storyline.key_recommendation}")
    lines.append("")

    # Supporting arguments (Pyramid)
    lines.append("## Supporting Evidence")
    lines.append("")
    for i, arg in enumerate(storyline.pyramid.supporting_arguments, 1):
        lines.append(f"{i}. {arg}")
    lines.append("")

    # Evidence
    if storyline.pyramid.evidence:
        lines.append("### Data & Evidence")
        for e in storyline.pyramid.evidence:
            lines.append(f"- {e}")
        lines.append("")

    # Sections
    if sections:
        for i, section in enumerate(sections, 1):
            lines.append(f"## {i}. {section['title']}")
            lines.append("")
            for slide_data in section.get("slides", []):
                if isinstance(slide_data, dict):
                    title = slide_data.get("action_title", "")
                    lines.append(f"### {title}")
                    bullets = slide_data.get("bullets", [])
                    for b in bullets:
                        if isinstance(b, dict):
                            prefix = b.get("bold_prefix", "")
                            text = b.get("text", "")
                            lines.append(f"- **{prefix}** {text}" if prefix else f"- {text}")
                    lines.append("")

    # Desired decision
    lines.append("## Decision Required")
    lines.append(f"{storyline.desired_decision}")
    lines.append("")

    return "\n".join(lines)


def deck_to_gamma_input(deck: Deck) -> str:
    """Convert a full Deck model to Gamma inputText format."""
    lines = []

    lines.append(f"# {deck.title}")
    if deck.subtitle:
        lines.append(f"*{deck.subtitle}*")
    if deck.client:
        lines.append(f"*Prepared for: {deck.client}*")
    if deck.date:
        lines.append(f"*{deck.date}*")
    lines.append("")

    for slide in deck.slides:
        lines.extend(_slide_to_gamma_lines(slide))
        lines.append("")

    if deck.appendix_slides:
        lines.append("---")
        lines.append("## Appendix")
        lines.append("")
        for slide in deck.appendix_slides:
            lines.extend(_slide_to_gamma_lines(slide))
            lines.append("")

    return "\n".join(lines)


def _slide_to_gamma_lines(slide: SlideContent) -> list[str]:
    """Convert a single SlideContent to Gamma text lines."""
    lines = []

    if slide.slide_type == SlideType.TITLE:
        lines.append(f"# {slide.action_title}")
        if slide.subtitle:
            lines.append(f"*{slide.subtitle}*")

    elif slide.slide_type == SlideType.EXECUTIVE_SUMMARY:
        lines.append(f"## {slide.action_title}")
        if slide.situation_text:
            lines.append(f"**Situation:** {slide.situation_text}")
        if slide.complication_text:
            lines.append(f"**Complication:** {slide.complication_text}")
        if slide.resolution_text:
            lines.append(f"**Resolution:** {slide.resolution_text}")

    elif slide.slide_type == SlideType.AGENDA:
        lines.append("## Agenda")
        for i, item in enumerate(slide.agenda_items or [], 1):
            marker = "**>>**" if slide.current_section == i - 1 else ""
            lines.append(f"{i}. {marker} {item}")

    elif slide.slide_type == SlideType.DIVIDER:
        num = f"{slide.section_number}. " if slide.section_number else ""
        lines.append(f"---")
        lines.append(f"## {num}{slide.action_title}")
        if slide.subtitle:
            lines.append(f"*{slide.subtitle}*")

    elif slide.slide_type in (SlideType.CONTENT_TEXT, SlideType.CONTENT_HYBRID,
                                SlideType.RECOMMENDATION):
        lines.append(f"### {slide.action_title}")
        if slide.subtitle:
            lines.append(f"**{slide.subtitle}**")
        for bullet in slide.bullets:
            prefix = f"**{bullet.bold_prefix}** " if bullet.bold_prefix else ""
            lines.append(f"- {prefix}{bullet.text}")
            for sub in bullet.sub_bullets:
                lines.append(f"  - {sub}")

    elif slide.slide_type == SlideType.CONTENT_CHART:
        lines.append(f"### {slide.action_title}")
        if slide.chart:
            lines.append(f"[Chart: {slide.chart.chart_type.value}]")
            if slide.chart.so_what:
                lines.append(f"**Key insight:** {slide.chart.so_what}")

    elif slide.slide_type == SlideType.NEXT_STEPS:
        lines.append(f"### {slide.action_title}")
        for item in slide.action_items or []:
            lines.append(f"- **{item.get('action', '')}** — Owner: {item.get('owner', '')}, "
                          f"Timeline: {item.get('timeline', '')}, Status: {item.get('status', '')}")

    if slide.source:
        lines.append(f"*Source: {slide.source}*")

    return lines


def get_gamma_params(storyline: Storyline = None, theme_style: str = "professional") -> dict:
    """Get recommended Gamma MCP parameters for a McKinsey-style presentation.

    Returns a dict of parameters to pass to the Gamma generate tool.
    """
    params = {
        "format": "presentation",
        "textMode": "generate",
        "cardOptions": {
            "dimensions": "16x9",
        },
        "textOptions": {
            "amount": "medium",
            "tone": "professional",
        },
        "imageOptions": {
            "source": "noImages",  # McKinsey decks don't use stock photos
        },
    }

    # Adjust based on audience
    if storyline:
        if storyline.audience.value in ("board", "client"):
            params["textOptions"]["amount"] = "brief"
            params["textOptions"]["audience"] = "executives"
        elif storyline.audience.value == "working_team":
            params["textOptions"]["amount"] = "detailed"
            params["textOptions"]["audience"] = "team members"

    return params
