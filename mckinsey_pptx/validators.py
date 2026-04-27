"""
McKinsey methodology enforcement layer.
Validates slides, storylines, and decks against real McKinsey patterns
extracted from 37 reference presentations (1565 titles, 17K+ bullets).

Integrated into the pipeline — runs automatically before deck save.
Returns warnings (fixable) and errors (blocking).
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Optional

from .models import SlideContent, SlideType, Deck, Storyline, BulletPoint
from .config import CONTENT_RULES


# =============================================================================
# VALIDATION RESULTS
# =============================================================================

@dataclass
class ValidationIssue:
    severity: str  # "error" or "warning"
    rule: str      # Rule name (e.g., "ACTION_TITLE", "MECE")
    message: str
    slide_index: Optional[int] = None
    suggestion: Optional[str] = None


@dataclass
class ValidationReport:
    issues: list[ValidationIssue] = field(default_factory=list)
    passed: bool = True
    score: int = 100  # 0-100 McKinsey adherence score

    def add(self, severity: str, rule: str, message: str,
            slide_index: int = None, suggestion: str = None):
        self.issues.append(ValidationIssue(
            severity=severity, rule=rule, message=message,
            slide_index=slide_index, suggestion=suggestion,
        ))
        if severity == "error":
            self.passed = False
            self.score = max(0, self.score - 10)
        elif severity == "warning":
            self.score = max(0, self.score - 3)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == "warning"]

    def summary(self) -> str:
        lines = [f"McKinsey Adherence Score: {self.score}/100"]
        if self.errors:
            lines.append(f"ERRORS ({len(self.errors)}):")
            for e in self.errors:
                slide = f" [Slide {e.slide_index}]" if e.slide_index is not None else ""
                lines.append(f"  X {e.rule}{slide}: {e.message}")
                if e.suggestion:
                    lines.append(f"    -> {e.suggestion}")
        if self.warnings:
            lines.append(f"WARNINGS ({len(self.warnings)}):")
            for w in self.warnings:
                slide = f" [Slide {w.slide_index}]" if w.slide_index is not None else ""
                lines.append(f"  ! {w.rule}{slide}: {w.message}")
                if w.suggestion:
                    lines.append(f"    -> {w.suggestion}")
        if not self.issues:
            lines.append("All checks passed.")
        return "\n".join(lines)


# =============================================================================
# REAL PATTERNS (from 37 McKinsey PDFs extraction)
# =============================================================================

# Top verbs in real McKinsey action titles (from deep_patterns.json)
MCKINSEY_ACTION_VERBS = {
    "is", "are", "have", "has", "will", "could", "can", "should",
    "increase", "enable", "need", "reduce", "decline", "drive", "reach",
    "account", "capture", "remains", "leads", "require", "grow",
    "represent", "offer", "provide", "support", "deliver", "achieve",
    "transform", "accelerate", "optimize", "expand", "create",
    "suggest", "indicate", "show", "reveal", "demonstrate",
    "outperform", "underperform", "dominate", "disrupt", "emerge",
}

# Real action title stats: avg 9.6 words, median 9, range 6-17
TITLE_MIN_WORDS = 6
TITLE_MAX_WORDS = 20
TITLE_IDEAL_WORDS = (8, 14)  # Sweet spot from real data

# Topic label indicators (these are NOT action titles)
TOPIC_STARTERS = {
    "table of contents", "agenda", "appendix", "overview", "introduction",
    "background", "context", "contents", "index", "disclaimer",
    "confidential", "draft", "exhibit", "figure", "source",
    "summary", "key findings", "next steps",
}

# Slide types exempt from action title requirement
EXEMPT_SLIDE_TYPES = {
    SlideType.TITLE, SlideType.AGENDA, SlideType.DIVIDER,
    SlideType.APPENDIX_DIVIDER, SlideType.APPENDIX_CONTENT,
}


# =============================================================================
# VALIDATORS
# =============================================================================

def validate_action_title(title: str, slide_index: int, slide_type: SlideType,
                          report: ValidationReport):
    """Validate that a slide title follows McKinsey action title rules.

    Real McKinsey pattern (from 37 PDFs):
    - 32% of slides use true action titles (the high-value content slides)
    - Avg 9.6 words, median 9, range 6-17
    - Top verbs: is, are, have, has, will, could, can, should
    - 29% contain numbers, 7% percentages, 17% comparisons
    """
    if slide_type in EXEMPT_SLIDE_TYPES:
        return  # These don't need action titles

    words = title.split()
    word_count = len(words)
    title_lower = title.lower().strip()

    # Check: Is it a topic label instead of a conclusion?
    if any(title_lower.startswith(t) for t in TOPIC_STARTERS):
        report.add("error", "ACTION_TITLE", f"'{title[:50]}...' is a topic label, not a conclusion",
                    slide_index=slide_index,
                    suggestion="Rewrite as a complete sentence stating what the audience should conclude")

    # Check: Too short (likely a label)
    elif word_count < TITLE_MIN_WORDS:
        report.add("warning", "ACTION_TITLE",
                    f"Title has {word_count} words — real McKinsey avg is 9.6 words",
                    slide_index=slide_index,
                    suggestion="Expand into a full sentence: '[Subject] [verb] [specific conclusion]'")

    # Check: Too long
    elif word_count > TITLE_MAX_WORDS:
        report.add("warning", "ACTION_TITLE",
                    f"Title has {word_count} words — max in real decks is ~17",
                    slide_index=slide_index,
                    suggestion="Condense to one clear sentence under 17 words")

    # Check: Contains an action verb
    has_verb = any(re.search(rf'\b{v}\b', title_lower) for v in MCKINSEY_ACTION_VERBS)
    if not has_verb and word_count >= TITLE_MIN_WORDS:
        report.add("warning", "ACTION_TITLE",
                    f"No action verb found in title",
                    slide_index=slide_index,
                    suggestion="Add a verb: 'X is/will/should/has [conclusion]'. "
                              "Top McKinsey verbs: is, are, will, has, should, could, drive, enable")


def validate_bullets(bullets: list[BulletPoint], slide_index: int,
                     report: ValidationReport):
    """Validate bullet points against McKinsey standards.

    Real pattern: most bullets are 1-9 words. Max 4 per slide.
    """
    if len(bullets) > CONTENT_RULES.MAX_BULLETS_PER_SLIDE:
        report.add("warning", "BULLETS",
                    f"Slide has {len(bullets)} bullets — McKinsey max is {CONTENT_RULES.MAX_BULLETS_PER_SLIDE}",
                    slide_index=slide_index,
                    suggestion="Remove the weakest bullets or split into two slides")

    for i, bullet in enumerate(bullets):
        words = len(bullet.text.split())
        if words > CONTENT_RULES.MAX_WORDS_PER_BULLET:
            report.add("warning", "BULLETS",
                        f"Bullet {i+1} has {words} words — real McKinsey bullets avg 5-9 words",
                        slide_index=slide_index,
                        suggestion="Shorten: state the conclusion, not the analysis")


def validate_so_what(slide: SlideContent, slide_index: int, report: ValidationReport):
    """Validate that charts have a 'so what' annotation.

    McKinsey rule: every chart must answer 'why does this matter?'
    """
    if slide.chart and not slide.chart.so_what:
        report.add("warning", "SO_WHAT",
                    "Chart has no 'so what' annotation",
                    slide_index=slide_index,
                    suggestion="Add so_what: 'Key takeaway in one sentence that drives the decision'")

    if slide.chart and not slide.chart.source and CONTENT_RULES.REQUIRE_SOURCE_ON_CHARTS:
        report.add("warning", "SOURCE",
                    "Chart has no source citation",
                    slide_index=slide_index,
                    suggestion="Add source: 'Company analysis, Year' or 'External Source, Year'")


def validate_scr(storyline: Storyline, report: ValidationReport):
    """Validate the SCR (Situation-Complication-Resolution) structure."""
    scr = storyline.scr

    if len(scr.situation.split()) < 10:
        report.add("warning", "SCR",
                    "Situation is too brief — should establish uncontroversial context",
                    suggestion="Expand: what does the audience already know? What's the current state?")

    if len(scr.complication.split()) < 10:
        report.add("warning", "SCR",
                    "Complication is too brief — should create tension and urgency",
                    suggestion="Expand: what changed? What's the threat or missed opportunity?")

    if len(scr.resolution.split()) < 10:
        report.add("warning", "SCR",
                    "Resolution is too brief — should state clear recommendation",
                    suggestion="Expand: what specifically should be done? Include scope, timeline, investment")

    # Check that resolution contains an actionable recommendation
    resolution_lower = scr.resolution.lower()
    has_action = any(w in resolution_lower for w in
                     ["should", "recommend", "propose", "enter", "invest",
                      "launch", "implement", "adopt", "pursue", "prioritize",
                      "expand", "phase", "build", "deploy", "partner"])
    if not has_action:
        report.add("warning", "SCR",
                    "Resolution doesn't contain a clear actionable verb",
                    suggestion="Start with: 'We recommend...' or 'The company should...'")


def validate_mece(items: list[str], context: str, report: ValidationReport):
    """Validate a grouping for MECE (Mutually Exclusive, Collectively Exhaustive).

    Checks:
    - Mutual exclusivity: no significant word overlap between items
    - Exhaustiveness: at least 2 items, ideally 3-5
    """
    if len(items) < 2:
        report.add("warning", "MECE",
                    f"{context}: Only {len(items)} item — need at least 2 for MECE",
                    suggestion="Add another dimension or split existing item")

    if len(items) > 5:
        report.add("warning", "MECE",
                    f"{context}: {len(items)} items — more than 5 reduces clarity",
                    suggestion="Consolidate into 3-4 MECE groups")

    # Check mutual exclusivity via word overlap
    stop_words = {"the", "a", "an", "and", "or", "of", "in", "to", "for", "is",
                  "are", "with", "by", "on", "at", "from", "that", "this", "will"}
    for i in range(len(items)):
        words_i = set(items[i].lower().split()) - stop_words
        for j in range(i + 1, len(items)):
            words_j = set(items[j].lower().split()) - stop_words
            overlap = words_i & words_j
            if len(overlap) >= 3:
                report.add("warning", "MECE",
                            f"{context}: Items {i+1} and {j+1} may overlap — shared words: {', '.join(list(overlap)[:5])}",
                            suggestion="Ensure each item covers a distinct, non-overlapping area")


def validate_pyramid(storyline: Storyline, report: ValidationReport):
    """Validate Pyramid Principle structure."""
    pyramid = storyline.pyramid

    # Governing thought should be specific
    if len(pyramid.governing_thought.split()) < 6:
        report.add("warning", "PYRAMID",
                    "Governing thought is too vague — should be a specific, actionable conclusion",
                    suggestion="State the full recommendation: 'We should [action] because [reason], "
                              "delivering [outcome]'")

    # Supporting arguments should be MECE
    validate_mece(pyramid.supporting_arguments, "Pyramid supporting arguments", report)

    # Check evidence exists
    if not pyramid.evidence:
        report.add("warning", "PYRAMID",
                    "No evidence provided for supporting arguments",
                    suggestion="Each argument needs at least one data point or fact backing it")


def validate_deck_structure(slides: list[SlideContent], report: ValidationReport):
    """Validate overall deck structure follows McKinsey patterns.

    Real McKinsey pattern (from 37 PDFs): avg 39 pages, sections with dividers.
    """
    if not slides:
        report.add("error", "STRUCTURE", "Deck has no slides")
        return

    # Check first slide is title
    if slides[0].slide_type != SlideType.TITLE:
        report.add("warning", "STRUCTURE",
                    "First slide should be a title slide",
                    slide_index=0)

    # Check exec summary exists
    has_exec = any(s.slide_type == SlideType.EXECUTIVE_SUMMARY for s in slides)
    if not has_exec:
        report.add("warning", "STRUCTURE",
                    "No executive summary slide — McKinsey decks always start with one",
                    suggestion="Add an executive summary with SCR structure after the title slide")

    # Check agenda exists
    has_agenda = any(s.slide_type == SlideType.AGENDA for s in slides)
    if not has_agenda:
        report.add("warning", "STRUCTURE",
                    "No agenda slide — helps audience follow the narrative")

    # Check content slide count
    content_slides = [s for s in slides if s.slide_type in
                      (SlideType.CONTENT_TEXT, SlideType.CONTENT_CHART,
                       SlideType.CONTENT_HYBRID, SlideType.CONTENT_TABLE,
                       SlideType.CONTENT_FRAMEWORK)]
    if len(content_slides) > CONTENT_RULES.MAX_SLIDES_MAIN_BODY:
        report.add("warning", "STRUCTURE",
                    f"Main body has {len(content_slides)} content slides — consider moving "
                    f"supporting detail to appendix (McKinsey avg: 39 pages total)")

    # Check that deck ends with recommendations or next steps
    if slides:
        last_content = [s for s in slides if s.slide_type not in
                        (SlideType.APPENDIX_DIVIDER, SlideType.APPENDIX_CONTENT)]
        if last_content and last_content[-1].slide_type not in (
                SlideType.RECOMMENDATION, SlideType.NEXT_STEPS):
            report.add("warning", "STRUCTURE",
                        "Deck doesn't end with recommendations or next steps",
                        suggestion="McKinsey decks close with clear action items and owners")


# =============================================================================
# MASTER VALIDATOR
# =============================================================================

def validate_deck(deck: Deck) -> ValidationReport:
    """Run all validators on a complete deck. Returns a ValidationReport."""
    report = ValidationReport()

    # Validate storyline
    if deck.storyline:
        validate_scr(deck.storyline, report)
        validate_pyramid(deck.storyline, report)

    # Validate deck structure
    validate_deck_structure(deck.slides, report)

    # Validate individual slides
    for i, slide in enumerate(deck.slides):
        validate_action_title(slide.action_title, i, slide.slide_type, report)

        if slide.bullets:
            validate_bullets(slide.bullets, i, report)

        if slide.chart:
            validate_so_what(slide, i, report)

    return report


def validate_slides(slides: list[SlideContent]) -> ValidationReport:
    """Validate a list of slides without a full Deck model."""
    report = ValidationReport()
    validate_deck_structure(slides, report)

    for i, slide in enumerate(slides):
        validate_action_title(slide.action_title, i, slide.slide_type, report)
        if slide.bullets:
            validate_bullets(slide.bullets, i, report)
        if slide.chart:
            validate_so_what(slide, i, report)

    return report
