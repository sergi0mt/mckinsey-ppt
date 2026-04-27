"""
McKinsey-style design constants: colors, fonts, sizes, spacing.
Based on McKinsey's visual identity and presentation best practices.
"""
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from dataclasses import dataclass


# =============================================================================
# COLOR PALETTE
# =============================================================================

@dataclass(frozen=True)
class McKinseyColors:
    """McKinsey corporate color palette — '50 shades of blue' + supporting."""

    # Primary blues (calibrated from 37 real McKinsey PDFs — #002960 most frequent)
    DARK_BLUE = RGBColor(0x00, 0x29, 0x60)      # #002960 — primary headings, titles (TOP accent in real decks)
    MCKINSEY_BLUE = RGBColor(0x00, 0x65, 0xBD)   # #0065BD — main accent (2nd most frequent)
    MEDIUM_BLUE = RGBColor(0x00, 0x66, 0xCC)     # #0066CC — secondary accent
    LIGHT_BLUE = RGBColor(0x00, 0xA9, 0xF4)      # #00A9F4 — highlights, links (confirmed match)

    # Grays
    BLACK = RGBColor(0x00, 0x00, 0x00)            # #000000
    DARK_GRAY = RGBColor(0x33, 0x33, 0x33)        # #333333 — body text
    MEDIUM_GRAY = RGBColor(0x66, 0x66, 0x66)      # #666666 — secondary text
    LIGHT_GRAY = RGBColor(0x99, 0x99, 0x99)       # #999999 — captions, footnotes
    PALE_GRAY = RGBColor(0xD9, 0xD9, 0xD9)        # #D9D9D9 — borders, dividers
    BACKGROUND_GRAY = RGBColor(0xF2, 0xF2, 0xF2)  # #F2F2F2 — subtle backgrounds
    WHITE = RGBColor(0xFF, 0xFF, 0xFF)             # #FFFFFF

    # Chart accent colors
    POSITIVE_GREEN = RGBColor(0x00, 0x96, 0x45)   # #009645 — positive values
    NEGATIVE_RED = RGBColor(0xCC, 0x00, 0x00)      # #CC0000 — negative values
    ACCENT_TEAL = RGBColor(0x00, 0x96, 0x88)       # #009688 — tertiary accent
    ACCENT_AMBER = RGBColor(0xFF, 0x8F, 0x00)      # #FF8F00 — warning/highlight

    # Chart series colors (calibrated to real McKinsey decks)
    CHART_SERIES = [
        RGBColor(0x00, 0x29, 0x60),  # Dark navy (most frequent accent)
        RGBColor(0x00, 0x65, 0xBD),  # McKinsey blue
        RGBColor(0x80, 0x80, 0x80),  # Gray (2nd most common in real decks)
        RGBColor(0x00, 0xA9, 0xF4),  # Light blue
        RGBColor(0x4D, 0x4D, 0x4D),  # Dark gray
        RGBColor(0x00, 0x66, 0xCC),  # Medium blue
    ]


COLORS = McKinseyColors()


# =============================================================================
# TYPOGRAPHY
# =============================================================================

@dataclass(frozen=True)
class Typography:
    """Font families and sizes following McKinsey standards."""

    # Font families — calibrated from 37 real McKinsey PDFs
    # ArialMT dominates (15530 uses), Georgia-Bold appears (576 uses) but only in specific decks
    HEADING_FONT = "Arial"           # Real McKinsey decks use Arial for titles (not Georgia)
    BODY_FONT = "Arial"              # Arial is the universal McKinsey font
    CHART_FONT = "Arial"             # Consistent across all elements
    MONOSPACE_FONT = "Consolas"      # For data tables
    FALLBACK_FONT = "Helvetica"      # 2nd most common font in real decks (2645 uses)

    # Slide title (action title) — real avg: 28.6pt, range 16-72pt
    TITLE_SIZE = Pt(28)
    TITLE_BOLD = True
    TITLE_COLOR = COLORS.DARK_BLUE

    # Subtitle / section header
    SUBTITLE_SIZE = Pt(20)
    SUBTITLE_BOLD = True
    SUBTITLE_COLOR = COLORS.MCKINSEY_BLUE

    # Body text — real avg: 20.7pt, range 11-40pt
    BODY_SIZE = Pt(18)
    BODY_BOLD = False
    BODY_COLOR = COLORS.DARK_GRAY

    # Bullet text
    BULLET_SIZE = Pt(16)
    BULLET_COLOR = COLORS.DARK_GRAY

    # Sub-bullet text (indented under main bullets)
    SUB_BULLET_SIZE = Pt(13)
    SUB_BULLET_COLOR = COLORS.MEDIUM_GRAY
    SUB_BULLET_SPACING = Pt(3)

    # Recommendation numbers and labels
    REC_NUMBER_SIZE = Pt(16)
    REC_LABEL_SIZE = Pt(14)

    # Table fonts
    TABLE_HEADER_SIZE = Pt(11)
    TABLE_BODY_SIZE = Pt(10)

    # Small text (captions, footnotes, sources)
    SMALL_SIZE = Pt(10)
    SMALL_COLOR = COLORS.LIGHT_GRAY

    # Chart labels
    CHART_LABEL_SIZE = Pt(12)
    CHART_TITLE_SIZE = Pt(14)

    # Executive summary
    EXEC_SUMMARY_SIZE = Pt(16)

    # Line spacing
    LINE_SPACING = Pt(18)
    BULLET_SPACING = Pt(6)      # Space after each bullet


FONTS = Typography()


# =============================================================================
# SLIDE LAYOUT DIMENSIONS
# =============================================================================

@dataclass(frozen=True)
class SlideLayout:
    """Standard slide dimensions and margins (16:9 widescreen)."""

    # Slide dimensions
    WIDTH = Inches(13.333)
    HEIGHT = Inches(7.5)

    # Margins
    LEFT_MARGIN = Inches(0.7)
    RIGHT_MARGIN = Inches(0.7)
    TOP_MARGIN = Inches(0.5)
    BOTTOM_MARGIN = Inches(0.5)

    # Title area
    TITLE_LEFT = Inches(0.7)
    TITLE_TOP = Inches(0.3)
    TITLE_WIDTH = Inches(11.9)
    TITLE_HEIGHT = Inches(0.9)

    # Subtitle / divider line position
    DIVIDER_TOP = Inches(1.25)

    # Content area (below title + divider)
    CONTENT_LEFT = Inches(0.7)
    CONTENT_TOP = Inches(1.5)
    CONTENT_WIDTH = Inches(11.9)
    CONTENT_HEIGHT = Inches(5.2)

    # Two-column layout
    COL_LEFT_WIDTH = Inches(5.7)
    COL_RIGHT_LEFT = Inches(6.8)
    COL_RIGHT_WIDTH = Inches(5.7)

    # Footer area
    FOOTER_TOP = Inches(7.0)
    FOOTER_HEIGHT = Inches(0.4)

    # Source line
    SOURCE_LEFT = Inches(0.7)
    SOURCE_TOP = Inches(6.9)
    SOURCE_WIDTH = Inches(9.0)
    SOURCE_HEIGHT = Inches(0.3)

    # Page number
    PAGE_NUM_LEFT = Inches(12.0)
    PAGE_NUM_TOP = Inches(6.9)
    PAGE_NUM_WIDTH = Inches(0.8)


LAYOUT = SlideLayout()


# =============================================================================
# SLIDE TYPES
# =============================================================================

SLIDE_TYPES = {
    "title": "Title slide with deck name, subtitle, date, and confidentiality notice",
    "executive_summary": "SCR-structured summary: situation, complication, resolution",
    "agenda": "Section overview with numbered items, current section highlighted",
    "divider": "Section break with section number and title, minimal design",
    "content_text": "Action title + bullet points (max 4 bullets)",
    "content_chart": "Action title + single chart with source annotation",
    "content_hybrid": "Action title + text on left, chart on right (two-column)",
    "content_table": "Action title + data table",
    "content_framework": "Action title + framework visual (2x2, issue tree, process)",
    "recommendation": "Key recommendations with prioritized action items",
    "next_steps": "Action items with owners, timelines, and status",
    "appendix_divider": "Appendix section break",
    "appendix_content": "Supporting detail slide for appendix",
}


# =============================================================================
# CHART DEFAULTS
# =============================================================================

@dataclass(frozen=True)
class ChartDefaults:
    """Default settings for McKinsey-style charts."""

    # Figure size for matplotlib (inches) — will be embedded in PPTX
    FIG_WIDTH = 10
    FIG_HEIGHT = 5.5

    # DPI for chart images
    DPI = 200

    # Background
    BG_COLOR = "white"
    GRID_COLOR = "#E0E0E0"
    GRID_ALPHA = 0.5

    # Spine visibility
    SHOW_TOP_SPINE = False
    SHOW_RIGHT_SPINE = False
    SHOW_LEFT_SPINE = True
    SHOW_BOTTOM_SPINE = True

    # Font sizes (matplotlib)
    MPL_TITLE_SIZE = 14
    MPL_LABEL_SIZE = 11
    MPL_TICK_SIZE = 10
    MPL_ANNOTATION_SIZE = 10

    # Waterfall specific
    WATERFALL_POSITIVE = "#009645"
    WATERFALL_NEGATIVE = "#CC0000"
    WATERFALL_TOTAL = "#002960"
    WATERFALL_CONNECTOR = "#999999"

    # Bar chart specific
    BAR_WIDTH = 0.6
    BAR_EDGE_COLOR = "none"

    # 2x2 matrix
    MATRIX_LINE_COLOR = "#999999"
    MATRIX_LINE_WIDTH = 1.5


CHART_DEFAULTS = ChartDefaults()


# =============================================================================
# CONTENT RULES
# =============================================================================

@dataclass(frozen=True)
class ContentRules:
    """McKinsey content quality rules."""

    MAX_BULLETS_PER_SLIDE = 4
    MAX_WORDS_PER_BULLET = 25
    MAX_WORDS_PER_TITLE = 20
    MIN_WORDS_PER_TITLE = 5       # Action titles must be full sentences
    MAX_SLIDES_MAIN_BODY = 30     # Excluding appendix
    MAX_SLIDES_EXEC_SUMMARY = 2
    REQUIRE_SOURCE_ON_CHARTS = True
    REQUIRE_ACTION_TITLES = True  # Titles must be conclusions, not topics


CONTENT_RULES = ContentRules()
