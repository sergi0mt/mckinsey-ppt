"""
Pydantic data models for McKinsey-style presentations.
Represents the full structure from storyline to individual slide elements.
"""
from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# =============================================================================
# ENUMS
# =============================================================================

class SlideType(str, Enum):
    TITLE = "title"
    EXECUTIVE_SUMMARY = "executive_summary"
    AGENDA = "agenda"
    DIVIDER = "divider"
    CONTENT_TEXT = "content_text"
    CONTENT_CHART = "content_chart"
    CONTENT_HYBRID = "content_hybrid"
    CONTENT_TABLE = "content_table"
    CONTENT_FRAMEWORK = "content_framework"
    RECOMMENDATION = "recommendation"
    NEXT_STEPS = "next_steps"
    APPENDIX_DIVIDER = "appendix_divider"
    APPENDIX_CONTENT = "appendix_content"


class ChartType(str, Enum):
    WATERFALL = "waterfall"
    BAR_VERTICAL = "bar_vertical"
    BAR_HORIZONTAL = "bar_horizontal"
    STACKED_BAR = "stacked_bar"
    GROUPED_BAR = "grouped_bar"
    LINE = "line"
    PIE = "pie"  # used sparingly in McKinsey
    BUBBLE = "bubble"
    SCATTER = "scatter"
    MATRIX_2X2 = "matrix_2x2"
    HARVEY_BALLS = "harvey_balls"
    TREEMAP = "treemap"


class FrameworkType(str, Enum):
    MATRIX_2X2 = "matrix_2x2"
    ISSUE_TREE = "issue_tree"
    PROCESS_FLOW = "process_flow"
    PYRAMID = "pyramid"
    VENN = "venn"
    TIMELINE = "timeline"
    FUNNEL = "funnel"


class Audience(str, Enum):
    BOARD = "board"               # C-suite / Board — concise, strategic
    CLIENT = "client"             # External client — polished, narrative-driven
    WORKING_TEAM = "working_team" # Internal team — detailed, data-heavy
    STEERING = "steering"         # Steering committee — progress + decisions


class DeckType(str, Enum):
    STRATEGIC = "strategic"       # High-level strategy recommendation
    DIAGNOSTIC = "diagnostic"     # Problem analysis and root causes
    IMPLEMENTATION = "implementation"  # Action plan with timelines
    PROGRESS_UPDATE = "progress_update"  # Status report
    MARKET_ENTRY = "market_entry"  # Market analysis + entry strategy
    DUE_DILIGENCE = "due_diligence"  # M&A / investment analysis
    TRANSFORMATION = "transformation"  # Operating model / org change


# =============================================================================
# STORYLINE MODELS
# =============================================================================

class SCRStructure(BaseModel):
    """Situation-Complication-Resolution storyline framework."""
    situation: str = Field(
        ..., description="Current state / context — uncontroversial facts the audience knows"
    )
    complication: str = Field(
        ..., description="Problem / challenge / change that disrupts the status quo"
    )
    resolution: str = Field(
        ..., description="Proposed solution / recommendation / course of action"
    )


class IssueTreeNode(BaseModel):
    """A node in the MECE issue tree."""
    question: str = Field(..., description="The sub-question or hypothesis")
    children: list[IssueTreeNode] = Field(default_factory=list)
    data_available: Optional[str] = Field(None, description="What data supports this branch")
    so_what: Optional[str] = Field(None, description="Key implication / conclusion")
    is_proven: Optional[bool] = Field(None, description="Whether hypothesis is supported")


class PyramidLevel(BaseModel):
    """A level in the Pyramid Principle structure."""
    governing_thought: str = Field(..., description="The key message at this level")
    supporting_arguments: list[str] = Field(
        default_factory=list,
        description="MECE supporting points (ideally 3)",
        max_length=5,
    )
    evidence: list[str] = Field(
        default_factory=list,
        description="Data/facts supporting each argument"
    )


class Storyline(BaseModel):
    """Complete storyline for a McKinsey deck."""
    central_question: str = Field(..., description="The one question this deck answers")
    audience: Audience = Field(default=Audience.CLIENT)
    deck_type: DeckType = Field(default=DeckType.STRATEGIC)
    scr: SCRStructure
    pyramid: PyramidLevel = Field(..., description="Top-level pyramid with governing thought")
    issue_tree: Optional[IssueTreeNode] = Field(None, description="Optional MECE issue tree")
    key_recommendation: str = Field(..., description="Primary recommendation in one sentence")
    desired_decision: str = Field(..., description="What decision the audience should make")


# =============================================================================
# SLIDE CONTENT MODELS
# =============================================================================

class BulletPoint(BaseModel):
    """A single bullet point with optional sub-bullets."""
    text: str
    bold_prefix: Optional[str] = Field(None, description="Bold text before the main text")
    sub_bullets: list[str] = Field(default_factory=list)


class ChartDataSeries(BaseModel):
    """A single data series for a chart."""
    name: str
    values: list[float]
    color: Optional[str] = None


class ChartSpec(BaseModel):
    """Specification for a chart to be rendered."""
    chart_type: ChartType
    title: Optional[str] = None
    x_label: Optional[str] = None
    y_label: Optional[str] = None
    categories: list[str] = Field(default_factory=list)
    series: list[ChartDataSeries] = Field(default_factory=list)
    source: Optional[str] = Field(None, description="Data source citation")
    so_what: Optional[str] = Field(None, description="Key takeaway annotation on chart")

    # 2x2 matrix specific
    quadrant_labels: Optional[list[str]] = Field(
        None, description="Labels for 4 quadrants [TL, TR, BL, BR]"
    )
    x_axis_low: Optional[str] = None
    x_axis_high: Optional[str] = None
    y_axis_low: Optional[str] = None
    y_axis_high: Optional[str] = None
    data_points: Optional[list[dict]] = Field(
        None, description="Points for scatter/bubble: [{label, x, y, size?}]"
    )

    # Harvey balls specific
    items: Optional[list[dict]] = Field(
        None, description="Items for Harvey balls: [{name, scores: [0-4]}]"
    )
    score_headers: Optional[list[str]] = None


class TableSpec(BaseModel):
    """Specification for a data table."""
    headers: list[str]
    rows: list[list[str]]
    source: Optional[str] = None
    highlight_rows: list[int] = Field(default_factory=list, description="Row indices to highlight")


class FrameworkSpec(BaseModel):
    """Specification for a framework visual."""
    framework_type: FrameworkType
    title: Optional[str] = None
    elements: list[dict] = Field(
        default_factory=list,
        description="Framework-specific elements"
    )


class SlideContent(BaseModel):
    """Content for a single slide."""
    slide_type: SlideType
    action_title: str = Field(
        ..., description="Governing thought — must be a complete sentence stating a conclusion"
    )
    subtitle: Optional[str] = None
    bullets: list[BulletPoint] = Field(default_factory=list)
    chart: Optional[ChartSpec] = None
    table: Optional[TableSpec] = None
    framework: Optional[FrameworkSpec] = None
    source: Optional[str] = Field(None, description="Source citation at bottom of slide")
    speaker_notes: Optional[str] = None
    section_number: Optional[int] = None
    section_name: Optional[str] = None

    # Executive summary specific
    situation_text: Optional[str] = None
    complication_text: Optional[str] = None
    resolution_text: Optional[str] = None

    # Next steps specific
    action_items: Optional[list[dict]] = Field(
        None, description="Action items: [{action, owner, timeline, status}]"
    )

    # Agenda specific
    agenda_items: Optional[list[str]] = None
    current_section: Optional[int] = None


# =============================================================================
# DECK MODEL
# =============================================================================

class Deck(BaseModel):
    """Complete McKinsey-style presentation deck."""
    title: str = Field(..., description="Deck title")
    subtitle: Optional[str] = None
    client: Optional[str] = None
    date: Optional[str] = None
    confidential: bool = True
    storyline: Storyline
    slides: list[SlideContent] = Field(default_factory=list)
    appendix_slides: list[SlideContent] = Field(default_factory=list)

    @property
    def total_slides(self) -> int:
        return len(self.slides) + len(self.appendix_slides)

    def get_slide_sequence(self) -> list[SlideContent]:
        """Return all slides in presentation order."""
        return self.slides + self.appendix_slides
