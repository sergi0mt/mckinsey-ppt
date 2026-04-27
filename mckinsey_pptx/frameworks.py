"""
McKinsey Consulting Frameworks Engine.

This is the THINKING layer — the conceptual logic that a consultant uses
to structure a problem before any slides are created.

Provides:
1. Chart selection logic (data type → best chart)
2. Slide sequencing rules (storyline → optimal slide order)
3. MECE decomposition templates (question → structured branches)
4. Deck archetypes (deck type → standard section structure)
5. Audience adaptation rules (audience → tone, detail, slide count)
"""
from __future__ import annotations
from .models import (
    ChartType, SlideType, Audience, DeckType,
    SlideContent, BulletPoint, ChartSpec,
)


# =============================================================================
# 1. CHART SELECTION LOGIC
# =============================================================================

# Decision tree: what kind of data → what chart
CHART_SELECTION_RULES = {
    "comparison": {
        "description": "Comparing values across categories",
        "few_categories": ChartType.BAR_VERTICAL,      # ≤6 categories
        "many_categories": ChartType.BAR_HORIZONTAL,    # >6 categories
        "ranked": ChartType.BAR_HORIZONTAL,             # Show ranking
        "examples": ["revenue by segment", "market share by competitor", "cost by department"],
    },
    "trend": {
        "description": "Showing change over time",
        "single_series": ChartType.LINE,
        "multiple_series": ChartType.LINE,
        "with_target": ChartType.LINE,                  # Add horizontal target line
        "examples": ["revenue over 5 years", "market growth trajectory", "KPI trend"],
    },
    "composition": {
        "description": "Showing parts of a whole",
        "over_time": ChartType.STACKED_BAR,             # Composition changing over time
        "single_point": ChartType.STACKED_BAR,          # One-time breakdown
        "few_parts": ChartType.PIE,                     # ≤5 parts (use sparingly)
        "examples": ["revenue mix", "cost breakdown", "market share split"],
    },
    "flow": {
        "description": "Showing how values change from A to B",
        "bridge": ChartType.WATERFALL,                  # Value bridge (adds/subtracts)
        "examples": ["EBITDA walk", "cost reduction bridge", "revenue change drivers"],
    },
    "positioning": {
        "description": "Plotting items on two dimensions",
        "strategic": ChartType.MATRIX_2X2,              # BCG matrix, prioritization
        "three_variables": ChartType.BUBBLE,            # Add size as 3rd dimension
        "examples": ["competitive positioning", "risk vs impact", "effort vs value"],
    },
    "qualitative": {
        "description": "Qualitative assessment without precise numbers",
        "vendor_comparison": ChartType.HARVEY_BALLS,
        "capability_assessment": ChartType.HARVEY_BALLS,
        "examples": ["vendor scorecard", "maturity assessment", "feature comparison"],
    },
}


def recommend_chart(data_intent: str, num_categories: int = 5,
                     num_series: int = 1, over_time: bool = False) -> dict:
    """Recommend the best chart type based on data intent and characteristics.

    Args:
        data_intent: What you're trying to show. One of:
            "comparison", "trend", "composition", "flow", "positioning", "qualitative"
        num_categories: Number of data categories (e.g., 5 segments)
        num_series: Number of data series (e.g., 2 for Brazil + Mexico)
        over_time: Whether data represents a time series

    Returns dict with:
        - chart_type: Recommended ChartType
        - reason: Why this chart was chosen
        - alternatives: Other viable options
        - tips: McKinsey-specific tips for this chart type
    """
    result = {"alternatives": [], "tips": []}

    if data_intent == "comparison":
        if num_categories > 6:
            result["chart_type"] = ChartType.BAR_HORIZONTAL
            result["reason"] = "Horizontal bars work better with many categories (>6) — easier to read labels"
        elif num_series > 1:
            result["chart_type"] = ChartType.GROUPED_BAR
            result["reason"] = "Grouped bars show side-by-side comparison across multiple series"
        else:
            result["chart_type"] = ChartType.BAR_VERTICAL
            result["reason"] = "Vertical bars are the standard for comparing categories"
        result["tips"] = [
            "Sort bars by value (largest first) unless there's a natural order",
            "Label each bar with its value — don't make the audience guess from the axis",
            "Title must state the conclusion, not 'Comparison of X'",
        ]
        result["alternatives"] = [ChartType.BAR_HORIZONTAL, ChartType.STACKED_BAR]

    elif data_intent == "trend":
        result["chart_type"] = ChartType.LINE
        result["reason"] = "Line charts are the standard for showing trends over time"
        result["tips"] = [
            "Use markers on data points for clarity",
            "Limit to 3-4 lines — more becomes hard to read",
            "Annotate inflection points or milestones on the line",
            "If showing a target, use a dashed horizontal line",
        ]
        result["alternatives"] = [ChartType.BAR_VERTICAL]

    elif data_intent == "composition":
        if over_time:
            result["chart_type"] = ChartType.STACKED_BAR
            result["reason"] = "Stacked bars show how composition changes over time"
        elif num_categories <= 4:
            result["chart_type"] = ChartType.PIE
            result["reason"] = "Pie chart works for simple composition (≤4 parts)"
            result["tips"] = ["McKinsey uses pie charts sparingly — consider stacked bar instead"]
        else:
            result["chart_type"] = ChartType.STACKED_BAR
            result["reason"] = "Stacked bar handles complex composition better than pie"
        result["tips"].extend([
            "Label percentages inside or beside each segment",
            "Order segments consistently across bars",
        ])
        result["alternatives"] = [ChartType.STACKED_BAR, ChartType.PIE]

    elif data_intent == "flow":
        result["chart_type"] = ChartType.WATERFALL
        result["reason"] = "Waterfall charts are McKinsey's signature for showing value bridges"
        result["tips"] = [
            "Green for positive, red for negative, blue/gray for totals",
            "Include connector lines between bars",
            "Start and end bars represent totals (not changes)",
            "The title should state the total change and top driver",
        ]

    elif data_intent == "positioning":
        if num_series <= 1:
            result["chart_type"] = ChartType.MATRIX_2X2
            result["reason"] = "2x2 matrix is McKinsey's go-to for strategic positioning"
        else:
            result["chart_type"] = ChartType.BUBBLE
            result["reason"] = "Bubble chart adds a third variable (size) to the positioning"
        result["tips"] = [
            "Name each quadrant with a clear, memorable label",
            "Choose axes that create genuine strategic tension",
            "Label every data point — don't rely on a legend",
        ]

    elif data_intent == "qualitative":
        result["chart_type"] = ChartType.HARVEY_BALLS
        result["reason"] = "Harvey balls are McKinsey's standard for qualitative comparisons"
        result["tips"] = [
            "Define what each fill level means in a legend (0=none, 4=full)",
            "Limit to 5-6 criteria and 3-5 items being compared",
            "Use for relative comparison, not precise measurement",
        ]

    return result


# =============================================================================
# 2. SLIDE SEQUENCING RULES
# =============================================================================

# Standard deck structure by type
DECK_ARCHETYPES = {
    DeckType.STRATEGIC: {
        "name": "Strategic Recommendation",
        "sections": [
            "Strategic context and market opportunity",
            "Analysis of options and trade-offs",
            "Recommended strategy with rationale",
            "Implementation roadmap and investment",
            "Risks, mitigations, and next steps",
        ],
        "typical_slides": 15,
        "emphasis": "Lead with recommendation, support with analysis",
    },
    DeckType.DIAGNOSTIC: {
        "name": "Diagnostic / Problem Analysis",
        "sections": [
            "Current situation and performance baseline",
            "Root cause analysis",
            "Impact quantification and prioritization",
            "Recommended interventions",
            "Implementation plan and quick wins",
        ],
        "typical_slides": 20,
        "emphasis": "Lead with the problem's impact, then drill into causes",
    },
    DeckType.MARKET_ENTRY: {
        "name": "Market Entry Assessment",
        "sections": [
            "Market opportunity and sizing",
            "Competitive landscape and positioning",
            "Entry strategy and phasing",
            "Financial projections and investment case",
            "Recommendations and next steps",
        ],
        "typical_slides": 18,
        "emphasis": "Market attractiveness first, then how to win",
    },
    DeckType.DUE_DILIGENCE: {
        "name": "Due Diligence / Investment Analysis",
        "sections": [
            "Investment thesis and target overview",
            "Market and competitive assessment",
            "Operational and financial analysis",
            "Value creation opportunities",
            "Risk assessment and recommendation",
        ],
        "typical_slides": 25,
        "emphasis": "Balanced view: upside potential AND risks",
    },
    DeckType.TRANSFORMATION: {
        "name": "Transformation / Operating Model",
        "sections": [
            "Case for change and burning platform",
            "Target state vision and operating model",
            "Transformation roadmap and workstreams",
            "Organization and capability requirements",
            "Governance, milestones, and quick wins",
        ],
        "typical_slides": 22,
        "emphasis": "Start with urgency, end with concrete actions",
    },
    DeckType.PROGRESS_UPDATE: {
        "name": "Progress Update / Steering Committee",
        "sections": [
            "Executive summary and overall status",
            "Progress against milestones",
            "Key issues and decisions required",
            "Updated timeline and next steps",
        ],
        "typical_slides": 10,
        "emphasis": "Status first, then only escalate what needs attention",
    },
    DeckType.IMPLEMENTATION: {
        "name": "Implementation Plan",
        "sections": [
            "Recap of strategy and objectives",
            "Detailed workplan and phasing",
            "Resource requirements and organization",
            "Risk mitigation and contingencies",
            "Governance, KPIs, and accountability",
        ],
        "typical_slides": 15,
        "emphasis": "Concrete, actionable, with clear owners and dates",
    },
}


def get_deck_archetype(deck_type: DeckType) -> dict:
    """Get the standard section structure for a deck type."""
    return DECK_ARCHETYPES.get(deck_type, DECK_ARCHETYPES[DeckType.STRATEGIC])


def generate_slide_sequence(deck_type: DeckType, sections: list[str] = None) -> list[dict]:
    """Generate the recommended slide sequence for a deck type.

    Returns a list of slide specs with type, suggested action title pattern, and section.
    """
    archetype = get_deck_archetype(deck_type)
    section_names = sections or archetype["sections"]

    sequence = [
        {"type": SlideType.TITLE, "purpose": "Cover slide"},
        {"type": SlideType.EXECUTIVE_SUMMARY, "purpose": "SCR summary — write this LAST"},
        {"type": SlideType.AGENDA, "purpose": "Section overview"},
    ]

    for i, section in enumerate(section_names):
        sequence.append({
            "type": SlideType.DIVIDER,
            "purpose": f"Section {i+1} divider",
            "section": section,
        })
        # Each section gets 2-4 content slides
        sequence.extend([
            {"type": SlideType.CONTENT_CHART, "purpose": f"Key data point for: {section}",
             "title_pattern": "[Subject] [verb] [quantified conclusion about {section}]"},
            {"type": SlideType.CONTENT_TEXT, "purpose": f"Implications of: {section}",
             "title_pattern": "[Implication/consequence] requires [action/decision]"},
        ])

    sequence.extend([
        {"type": SlideType.RECOMMENDATION, "purpose": "Prioritized recommendations"},
        {"type": SlideType.NEXT_STEPS, "purpose": "Action items with owners and timelines"},
    ])

    return sequence


# =============================================================================
# 3. MECE DECOMPOSITION TEMPLATES
# =============================================================================

MECE_TEMPLATES = {
    "market_entry": {
        "root": "Should we enter market X?",
        "branches": [
            {
                "question": "Is the market attractive?",
                "sub_questions": [
                    "What is the total addressable market size and growth?",
                    "What are the key demand drivers and trends?",
                    "What are the regulatory and structural barriers?",
                ],
            },
            {
                "question": "Can we win in this market?",
                "sub_questions": [
                    "What is the competitive landscape and intensity?",
                    "What is our competitive advantage vs. incumbents?",
                    "What capabilities do we need to build or acquire?",
                ],
            },
            {
                "question": "Is it worth the investment?",
                "sub_questions": [
                    "What is the required investment and timeline?",
                    "What is the expected return and payback period?",
                    "What are the key risks and how do we mitigate them?",
                ],
            },
        ],
    },
    "cost_reduction": {
        "root": "How can we reduce costs by X%?",
        "branches": [
            {
                "question": "Where are the largest cost pools?",
                "sub_questions": [
                    "What is the cost breakdown by category?",
                    "Which categories have grown fastest?",
                    "How do we benchmark vs. peers?",
                ],
            },
            {
                "question": "What are the actionable levers?",
                "sub_questions": [
                    "What can be eliminated (zero-based)?",
                    "What can be optimized (process improvement)?",
                    "What can be outsourced or automated?",
                ],
            },
            {
                "question": "How do we implement and sustain?",
                "sub_questions": [
                    "What is the implementation sequence and timeline?",
                    "What governance prevents cost creep?",
                    "How do we track and reinforce savings?",
                ],
            },
        ],
    },
    "growth_strategy": {
        "root": "How do we achieve X% growth?",
        "branches": [
            {
                "question": "Where is growth coming from?",
                "sub_questions": [
                    "What is the organic growth potential in current markets?",
                    "What new markets or segments can we enter?",
                    "What adjacent products or services can we launch?",
                ],
            },
            {
                "question": "What do we need to invest?",
                "sub_questions": [
                    "What capabilities must we build?",
                    "What M&A or partnerships accelerate growth?",
                    "What is the capital requirement and funding source?",
                ],
            },
            {
                "question": "What is the risk-adjusted return?",
                "sub_questions": [
                    "What are the financial projections by scenario?",
                    "What are the key risks and sensitivities?",
                    "What is the decision framework (go/no-go criteria)?",
                ],
            },
        ],
    },
    "digital_transformation": {
        "root": "How should we digitally transform?",
        "branches": [
            {
                "question": "Where is digital creating the most value?",
                "sub_questions": [
                    "Which processes have the highest automation potential?",
                    "Where is data-driven decision-making underutilized?",
                    "What customer journeys can be digitized?",
                ],
            },
            {
                "question": "What is our digital maturity gap?",
                "sub_questions": [
                    "How do we compare to digital leaders in our industry?",
                    "What technology infrastructure is needed?",
                    "What talent and organizational changes are required?",
                ],
            },
            {
                "question": "What is the transformation roadmap?",
                "sub_questions": [
                    "What are the quick wins vs. foundational investments?",
                    "How do we sequence for maximum impact?",
                    "How do we measure progress and sustain momentum?",
                ],
            },
        ],
    },
    "generic": {
        "root": "How should we address [problem/opportunity]?",
        "branches": [
            {
                "question": "What is the current state and why does it matter?",
                "sub_questions": [
                    "What is the baseline and how did we get here?",
                    "What is the cost of inaction?",
                    "Who is affected and what are their needs?",
                ],
            },
            {
                "question": "What are the options and trade-offs?",
                "sub_questions": [
                    "What are the 2-3 viable options?",
                    "What are the pros/cons of each?",
                    "What criteria should we use to decide?",
                ],
            },
            {
                "question": "What should we do and how?",
                "sub_questions": [
                    "What is the recommended course of action?",
                    "What resources and timeline are needed?",
                    "How do we measure success?",
                ],
            },
        ],
    },
}


def get_mece_template(problem_type: str) -> dict:
    """Get a MECE decomposition template for a problem type.

    Available templates: market_entry, cost_reduction, growth_strategy,
    digital_transformation, generic.
    """
    return MECE_TEMPLATES.get(problem_type, MECE_TEMPLATES["generic"])


def suggest_mece_template(question: str) -> str:
    """Suggest the best MECE template based on the central question."""
    q = question.lower()

    if any(w in q for w in ["enter", "market", "expand", "geography", "country", "region"]):
        return "market_entry"
    elif any(w in q for w in ["cost", "reduce", "save", "efficiency", "optimize", "cut"]):
        return "cost_reduction"
    elif any(w in q for w in ["grow", "growth", "revenue", "scale", "expand"]):
        return "growth_strategy"
    elif any(w in q for w in ["digital", "transform", "automate", "technology", "ai", "data"]):
        return "digital_transformation"
    return "generic"


# =============================================================================
# 4. AUDIENCE ADAPTATION RULES
# =============================================================================

AUDIENCE_RULES = {
    Audience.BOARD: {
        "max_slides": 12,
        "detail_level": "high-level",
        "tone": "decisive, executive",
        "bullet_max_words": 15,
        "focus": "Decision and investment ask",
        "rules": [
            "Lead with the ask — what do you need them to approve?",
            "Max 3 supporting arguments",
            "Include only data that drives the decision",
            "End with clear decision point and dollar amount",
            "No jargon, no deep technical detail",
            "Appendix for backup — they may not read it",
        ],
    },
    Audience.CLIENT: {
        "max_slides": 20,
        "detail_level": "medium",
        "tone": "professional, consultative",
        "bullet_max_words": 20,
        "focus": "Recommendation with evidence",
        "rules": [
            "SCR is critical — set context before recommending",
            "Balance insight with actionability",
            "Include benchmarks and external data",
            "Show you understand their specific context",
            "End with phased roadmap and next steps",
        ],
    },
    Audience.WORKING_TEAM: {
        "max_slides": 30,
        "detail_level": "detailed",
        "tone": "analytical, collaborative",
        "bullet_max_words": 25,
        "focus": "Analysis depth and methodology",
        "rules": [
            "Include methodology and data sources",
            "Show the analysis, not just conclusions",
            "More charts, more data tables",
            "Discussion points and open questions are OK",
            "Technical detail is expected",
        ],
    },
    Audience.STEERING: {
        "max_slides": 10,
        "detail_level": "status-focused",
        "tone": "concise, action-oriented",
        "bullet_max_words": 15,
        "focus": "Status, decisions needed, escalations",
        "rules": [
            "Start with overall status (on track / at risk / delayed)",
            "Only escalate what needs their attention",
            "Clear asks: decisions, resources, approvals",
            "Traffic light indicators for workstreams",
            "Keep it under 10 slides — they have 30 minutes",
        ],
    },
}


def get_audience_rules(audience: Audience) -> dict:
    """Get presentation rules adapted for the target audience."""
    return AUDIENCE_RULES.get(audience, AUDIENCE_RULES[Audience.CLIENT])


# =============================================================================
# 5. ACTION TITLE PATTERNS
# =============================================================================

# Patterns extracted from 500 real McKinsey action titles
ACTION_TITLE_FORMULAS = {
    "quantified_conclusion": {
        "pattern": "[Subject] [verb] [number] [unit], driven by [driver]",
        "examples": [
            "The addressable market will reach $50B by 2028, driven by digital adoption",
            "Operating costs can be reduced by 15%, driven by automation of manual processes",
            "Customer retention has improved by 12pp since implementing the loyalty program",
        ],
    },
    "comparison": {
        "pattern": "[Subject] [outperforms/lags] [benchmark] on [dimension]",
        "examples": [
            "Our unit economics outperform competitors by 2x on customer acquisition cost",
            "Latin America lags Western Europe by 5 years on digital banking adoption",
            "Phase 1 results exceed the business case by 20% across all KPIs",
        ],
    },
    "causal": {
        "pattern": "[Cause/trend] is driving/enabling/requiring [consequence]",
        "examples": [
            "Accelerating digital adoption is creating a narrowing window of opportunity",
            "Regulatory changes are requiring a fundamental redesign of the compliance model",
            "Three new entrants are driving margin compression across the industry",
        ],
    },
    "recommendation": {
        "pattern": "We recommend [action] to [achieve outcome] by [timeline]",
        "examples": [
            "We recommend a phased entry starting with Brazil to capture first-mover advantage",
            "The company should invest $10M over 18 months to establish LatAm operations",
            "Prioritizing digital channels will reduce CAC by 40% within the first year",
        ],
    },
    "state_of_play": {
        "pattern": "[Subject] is/are [state], [implication]",
        "examples": [
            "The Polish insurance market is forecasted to grow by ~5% p.a. until 2028",
            "Advanced analytics capabilities are key to a successful transformation",
            "Data-driven employee management can reduce absenteeism costs by 25%",
        ],
    },
}


def suggest_action_title(slide_purpose: str, data_summary: str = "") -> list[str]:
    """Suggest action title formulas appropriate for a slide's purpose.

    Returns list of formula patterns the user can fill in.
    """
    suggestions = []

    purpose_lower = slide_purpose.lower()

    if any(w in purpose_lower for w in ["market", "size", "growth", "trend", "forecast"]):
        suggestions.append(ACTION_TITLE_FORMULAS["quantified_conclusion"])
        suggestions.append(ACTION_TITLE_FORMULAS["state_of_play"])

    elif any(w in purpose_lower for w in ["compet", "benchmark", "compare", "vs", "position"]):
        suggestions.append(ACTION_TITLE_FORMULAS["comparison"])
        suggestions.append(ACTION_TITLE_FORMULAS["causal"])

    elif any(w in purpose_lower for w in ["recommend", "strategy", "invest", "should", "propose"]):
        suggestions.append(ACTION_TITLE_FORMULAS["recommendation"])
        suggestions.append(ACTION_TITLE_FORMULAS["quantified_conclusion"])

    elif any(w in purpose_lower for w in ["driver", "cause", "impact", "change", "disruption"]):
        suggestions.append(ACTION_TITLE_FORMULAS["causal"])
        suggestions.append(ACTION_TITLE_FORMULAS["quantified_conclusion"])

    else:
        suggestions.append(ACTION_TITLE_FORMULAS["state_of_play"])
        suggestions.append(ACTION_TITLE_FORMULAS["quantified_conclusion"])

    return suggestions
