"""
Storyline engine: SCR builder, Pyramid structuring, MECE validation.
Converts user inputs into a structured McKinsey storyline ready for slide generation.
"""
from __future__ import annotations
from typing import Optional

from .models import (
    Storyline, SCRStructure, PyramidLevel, IssueTreeNode,
    SlideContent, SlideType, BulletPoint, ChartSpec,
    Audience, DeckType,
)


# =============================================================================
# SCR BUILDER
# =============================================================================

def build_scr(situation: str, complication: str, resolution: str) -> SCRStructure:
    """Build a validated SCR (Situation-Complication-Resolution) structure."""
    return SCRStructure(
        situation=situation.strip(),
        complication=complication.strip(),
        resolution=resolution.strip(),
    )


# =============================================================================
# PYRAMID BUILDER
# =============================================================================

def build_pyramid(
    governing_thought: str,
    supporting_arguments: list[str],
    evidence: list[str] | None = None,
) -> PyramidLevel:
    """Build a Pyramid Principle structure.

    Args:
        governing_thought: The top-level conclusion/recommendation.
        supporting_arguments: 2-4 MECE supporting points.
        evidence: Data/facts backing each argument.
    """
    if len(supporting_arguments) < 2:
        raise ValueError("Pyramid Principle requires at least 2 supporting arguments")
    if len(supporting_arguments) > 5:
        raise ValueError("Too many supporting arguments — keep it to 3-5 for clarity")

    return PyramidLevel(
        governing_thought=governing_thought.strip(),
        supporting_arguments=[a.strip() for a in supporting_arguments],
        evidence=[e.strip() for e in (evidence or [])],
    )


# =============================================================================
# ISSUE TREE BUILDER
# =============================================================================

def build_issue_tree(
    root_question: str,
    branches: list[dict],
) -> IssueTreeNode:
    """Build a MECE issue tree from a root question and branches.

    Args:
        root_question: The central question to decompose.
        branches: List of dicts with keys:
            - question: str
            - children: list[dict] (optional, recursive)
            - data_available: str (optional)
            - so_what: str (optional)
    """
    def _build_node(data: dict) -> IssueTreeNode:
        children = [_build_node(c) for c in data.get("children", [])]
        return IssueTreeNode(
            question=data["question"],
            children=children,
            data_available=data.get("data_available"),
            so_what=data.get("so_what"),
            is_proven=data.get("is_proven"),
        )

    child_nodes = [_build_node(b) for b in branches]
    return IssueTreeNode(question=root_question, children=child_nodes)


# =============================================================================
# MECE VALIDATOR
# =============================================================================

def validate_mece(items: list[str]) -> dict:
    """Basic MECE validation — checks for obvious overlaps and coverage gaps.

    Returns a dict with:
        - is_valid: bool
        - overlaps: list of potential overlap pairs
        - suggestions: list of improvement suggestions
    """
    overlaps = []
    lower_items = [item.lower() for item in items]

    # Check for word overlap between items (simple heuristic)
    for i in range(len(lower_items)):
        words_i = set(lower_items[i].split())
        for j in range(i + 1, len(lower_items)):
            words_j = set(lower_items[j].split())
            common = words_i & words_j - {"the", "a", "an", "and", "or", "of", "in", "to", "for", "is", "are", "with"}
            if len(common) >= 2:
                overlaps.append((items[i], items[j], list(common)))

    suggestions = []
    if len(items) < 2:
        suggestions.append("Need at least 2 items for a meaningful MECE grouping")
    if len(items) > 5:
        suggestions.append("Consider consolidating — more than 5 items reduces clarity")
    if overlaps:
        suggestions.append("Potential overlaps detected — ensure each item is mutually exclusive")

    return {
        "is_valid": len(overlaps) == 0 and 2 <= len(items) <= 5,
        "overlaps": overlaps,
        "suggestions": suggestions,
    }


# =============================================================================
# SO-WHAT TEST
# =============================================================================

def apply_so_what_test(statement: str) -> dict:
    """Evaluate whether a statement passes the So-What test.

    A statement passes if it:
    1. States a specific conclusion (not just a topic)
    2. Implies an action or decision
    3. Is quantified where possible

    Returns evaluation dict.
    """
    issues = []

    # Check if it's a topic label vs. a conclusion
    topic_indicators = ["overview", "analysis", "summary", "update", "review", "background"]
    if any(statement.lower().startswith(word) for word in topic_indicators):
        issues.append("Starts with a topic label — rephrase as a conclusion")

    # Check for specificity
    vague_words = ["some", "various", "several", "many", "certain", "a number of"]
    if any(w in statement.lower() for w in vague_words):
        issues.append("Uses vague quantifiers — be specific with numbers")

    # Check for action orientation
    if not any(c in statement for c in [".", "will", "should", "must", "need", "require",
                                          "increase", "decrease", "reduce", "improve",
                                          "drive", "enable", "create", "generate"]):
        issues.append("Lacks action orientation — state what should happen or what changed")

    # Check length (too short = likely a label, not a sentence)
    word_count = len(statement.split())
    if word_count < 5:
        issues.append("Too short to be an action title — expand into a full sentence")
    if word_count > 25:
        issues.append("Too long — condense to one clear sentence (max ~20 words)")

    return {
        "passes": len(issues) == 0,
        "statement": statement,
        "issues": issues,
        "suggestion": "Good action title" if not issues else "Revise: " + "; ".join(issues),
    }


# =============================================================================
# STORYLINE BUILDER
# =============================================================================

def build_storyline(
    central_question: str,
    audience: Audience,
    deck_type: DeckType,
    situation: str,
    complication: str,
    resolution: str,
    key_recommendation: str,
    desired_decision: str,
    supporting_arguments: list[str],
    evidence: list[str] | None = None,
    issue_tree_data: dict | None = None,
) -> Storyline:
    """Build a complete McKinsey storyline from user inputs.

    This is the main entry point for constructing the logical backbone
    of a presentation.
    """
    scr = build_scr(situation, complication, resolution)
    pyramid = build_pyramid(key_recommendation, supporting_arguments, evidence)

    issue_tree = None
    if issue_tree_data:
        issue_tree = build_issue_tree(
            issue_tree_data["root_question"],
            issue_tree_data.get("branches", []),
        )

    return Storyline(
        central_question=central_question,
        audience=audience,
        deck_type=deck_type,
        scr=scr,
        pyramid=pyramid,
        issue_tree=issue_tree,
        key_recommendation=key_recommendation,
        desired_decision=desired_decision,
    )


# =============================================================================
# STORYLINE → SLIDE SEQUENCE
# =============================================================================

def storyline_to_slides(storyline: Storyline, sections: list[dict]) -> list[SlideContent]:
    """Convert a storyline and section content into an ordered list of SlideContent.

    Args:
        storyline: The complete storyline with SCR, pyramid, etc.
        sections: List of section dicts, each with:
            - title: str (section name)
            - slides: list of SlideContent dicts
    """
    all_slides: list[SlideContent] = []

    # 1. Title slide
    all_slides.append(SlideContent(
        slide_type=SlideType.TITLE,
        action_title=storyline.central_question,
        subtitle=storyline.key_recommendation,
    ))

    # 2. Executive Summary
    all_slides.append(SlideContent(
        slide_type=SlideType.EXECUTIVE_SUMMARY,
        action_title=storyline.key_recommendation,
        situation_text=storyline.scr.situation,
        complication_text=storyline.scr.complication,
        resolution_text=storyline.scr.resolution,
    ))

    # 3. Agenda
    section_names = [s["title"] for s in sections]
    all_slides.append(SlideContent(
        slide_type=SlideType.AGENDA,
        action_title="Agenda",
        agenda_items=section_names,
        current_section=None,
    ))

    # 4. Sections with dividers and content
    for i, section in enumerate(sections):
        # Section divider
        all_slides.append(SlideContent(
            slide_type=SlideType.DIVIDER,
            action_title=section["title"],
            section_number=i + 1,
        ))

        # Agenda reminder (showing current section)
        all_slides.append(SlideContent(
            slide_type=SlideType.AGENDA,
            action_title="Agenda",
            agenda_items=section_names,
            current_section=i,
        ))

        # Section slides
        for slide_data in section.get("slides", []):
            if isinstance(slide_data, SlideContent):
                all_slides.append(slide_data)
            elif isinstance(slide_data, dict):
                all_slides.append(SlideContent(**slide_data))

    # 5. Recommendations
    if storyline.pyramid.supporting_arguments:
        rec_bullets = [
            BulletPoint(text=arg)
            for arg in storyline.pyramid.supporting_arguments
        ]
        all_slides.append(SlideContent(
            slide_type=SlideType.RECOMMENDATION,
            action_title=storyline.key_recommendation,
            bullets=rec_bullets,
        ))

    return all_slides
