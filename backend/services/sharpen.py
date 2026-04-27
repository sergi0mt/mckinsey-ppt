"""Sharpen service — preview-only AI edits for V2 surfaces.

Each function builds a McKinsey-style refine prompt, calls the LLM via
ai_service.complete (powerful tier — gemini-3.1-pro), parses the JSON, and
returns a {before, after, rationale} payload. The router applies nothing
server-side; the client decides whether to commit the edit through the
existing slide/session/research update endpoints.

The five targets:
  - action_title          → tighten a slide's action title to ≤target_words
  - chart                 → recommend a chart_type + categories/series spec
  - citation              → propose a Tier-1 source the slide should cite
  - briefing_field        → sharpen one of the briefing form fields
  - slide_full            → full-slide refresh (action_title + content_json)

All five use task="refine" which routes to settings.model_powerful.
"""
from __future__ import annotations

import json
from typing import Any

from .ai_service import complete
from .json_cleaner import clean_json_response


# ────────────────────────────────────────────────────────────────
# Common system prompt — McKinsey editor voice
# ────────────────────────────────────────────────────────────────

EDITOR_SYSTEM = (
    "You are a McKinsey partner-level editor reviewing one element of a "
    "consulting deck. You know the Pyramid Principle, action titles, the SCR "
    "framework, MECE structure, and the McKinsey rule that every claim must "
    "carry a so-what and a Tier-1 source. You are concise, precise, and "
    "never lose the underlying insight when you tighten language. Always "
    "respond with valid JSON exactly matching the schema requested — no "
    "preamble, no markdown fences, no commentary outside the JSON."
)


# ────────────────────────────────────────────────────────────────
# action_title — tighten a slide's action title
# ────────────────────────────────────────────────────────────────

async def sharpen_action_title(slide: dict, project: dict, target_words: int = 9) -> dict:
    current = slide.get("action_title", "") or ""
    word_count = len([w for w in current.split() if w])
    user_prompt = f"""Tighten this McKinsey-style action title to {target_words} words or fewer
without losing its insight. Keep one verb (drives / enables / threatens / requires …),
keep one number when present, keep the so-what (the consequence). Avoid filler words
("in order to", "the fact that"). Do NOT change the underlying claim.

Current title ({word_count} words): "{current}"

Slide context:
  type:      {slide.get("slide_type", "?")}
  position:  {slide.get("position", 0) + 1}
  bullets:   {_compact(slide.get("content_json", {}).get("bullets"))}

Project: "{project.get("name", "")}"
Audience: {project.get("audience", "")}
Deck type: {project.get("deck_type", "")}

Return JSON exactly:
{{"after": "<tightened title, ≤{target_words} words>",
  "rationale": "<one short sentence explaining the edit>"}}"""

    parsed = await _call_and_parse(user_prompt)
    return {
        "target": "action_title",
        "before": current,
        "after": str(parsed.get("after", current)).strip().strip('"'),
        "rationale": str(parsed.get("rationale", "")).strip(),
    }


# ────────────────────────────────────────────────────────────────
# chart — recommend a chart_type + spec
# ────────────────────────────────────────────────────────────────

VALID_CHART_TYPES = {
    "bar_vertical", "bar_horizontal", "line",
    "waterfall", "stacked_bar", "matrix_2x2", "harvey_balls",
}


async def sharpen_chart(slide: dict, project: dict, requested_type: str | None = None) -> dict:
    cj = slide.get("content_json", {}) or {}
    current_chart = cj.get("chart") or {}
    type_constraint = (
        f'You MUST use chart_type "{requested_type}".'
        if requested_type and requested_type in VALID_CHART_TYPES
        else "Pick the chart_type that best supports the action title."
    )
    user_prompt = f"""Recommend a chart spec for this slide. {type_constraint}

Slide action title: "{slide.get("action_title", "")}"
Slide bullets: {_compact(cj.get("bullets"))}
Current chart spec: {json.dumps(current_chart, ensure_ascii=False)}
Project: "{project.get("name", "")}"

Available chart_types and when to use each:
  - bar_vertical:   compare 2-7 categories along one metric
  - bar_horizontal: same as bar_vertical when category names are long
  - line:           change over time, 4+ time points
  - waterfall:      breakdown of a total into contributors (start → +A → +B → end)
  - stacked_bar:    composition that changes across categories
  - matrix_2x2:     positioning across two binary dimensions
  - harvey_balls:   qualitative scoring of options across criteria

Return JSON exactly:
{{"chart_type": "<one of the 7 types>",
  "categories": ["<label1>", "<label2>", ...],
  "series": [{{"name": "<series name>", "values": [<num1>, <num2>, ...]}}],
  "so_what": "<1-sentence implication, 12 words max>",
  "source": "<Tier-1 attribution, e.g. 'McKinsey Global Institute, 2025'>",
  "rationale": "<one short sentence why this chart_type and not another>"}}

If you do not have hard numbers, use plausible illustrative figures consistent
with the action title — flag in the rationale that data is illustrative."""

    parsed = await _call_and_parse(user_prompt)
    chart_type = str(parsed.get("chart_type", current_chart.get("chart_type", "bar_vertical")))
    if chart_type not in VALID_CHART_TYPES:
        chart_type = "bar_vertical"

    after_chart = {
        "chart_type": chart_type,
        "categories": parsed.get("categories") or current_chart.get("categories") or [],
        "series": parsed.get("series") or current_chart.get("series") or [],
        "so_what": parsed.get("so_what") or current_chart.get("so_what") or "",
        "source": parsed.get("source") or current_chart.get("source") or "",
    }
    return {
        "target": "chart",
        "before": current_chart,
        "after": after_chart,
        "rationale": str(parsed.get("rationale", "")).strip(),
    }


# ────────────────────────────────────────────────────────────────
# citation — propose a Tier-1 source
# ────────────────────────────────────────────────────────────────

async def sharpen_citation(slide: dict, project: dict, research_brief: dict | None = None) -> dict:
    cj = slide.get("content_json", {}) or {}
    existing_source = cj.get("source") or (cj.get("chart") or {}).get("source") or ""

    brief_excerpt = ""
    if research_brief:
        # Pull the strongest evidence + executive summary if present
        ev = research_brief.get("strongest_evidence") or []
        if ev:
            brief_excerpt = "Existing research findings:\n" + "\n".join(f"  - {e}" for e in ev[:6])
        elif research_brief.get("executive_summary"):
            brief_excerpt = f"Existing research summary:\n{research_brief['executive_summary'][:600]}"

    user_prompt = f"""Propose ONE additional Tier-1 source the slide should cite. Tier-1 means:
official institutions (World Bank, IMF, OECD, government statistics, central banks),
top-tier consultancies (McKinsey, BCG, Bain), or peer-reviewed academic journals.
Avoid blogs, news aggregators, opinion pieces, and Wikipedia.

Slide action title: "{slide.get("action_title", "")}"
Slide bullets: {_compact(cj.get("bullets"))}
Existing source: "{existing_source or "(none)"}"
Project: "{project.get("name", "")}", audience: {project.get("audience", "")}
{brief_excerpt}

Return JSON exactly:
{{"title":         "<full title of the report or paper>",
  "url":           "<canonical URL>",
  "snippet":       "<1-2 sentence quote or summary that would back the slide's claim>",
  "quality_tier":  "high",
  "quality_score": 0.92,
  "rationale":     "<one sentence: why this source is Tier-1 and why it matches this slide's claim>"}}

Use a real publisher and a plausible URL pattern (e.g. https://www.imf.org/...,
https://data.worldbank.org/..., https://www.mckinsey.com/...). Mark the
rationale clearly if the citation is illustrative because the AI cannot
guarantee URL liveness."""

    parsed = await _call_and_parse(user_prompt)
    after_source = {
        "title": str(parsed.get("title", "")).strip(),
        "url": str(parsed.get("url", "")).strip(),
        "snippet": str(parsed.get("snippet", "")).strip(),
        "quality_tier": str(parsed.get("quality_tier", "high")).strip(),
        "quality_score": _coerce_float(parsed.get("quality_score"), 0.85),
    }
    return {
        "target": "citation",
        "before": existing_source,
        "after": after_source,
        "rationale": str(parsed.get("rationale", "")).strip(),
    }


# ────────────────────────────────────────────────────────────────
# briefing_field — sharpen one of the 5 briefing fields
# ────────────────────────────────────────────────────────────────

BRIEFING_FIELD_RULES: dict[str, str] = {
    "central_question": (
        "Decision-shaped (yes/no/which-of), single sentence, ≤25 words, no compound questions."
    ),
    "desired_decision": (
        "Concrete and actionable. Names a verb (Approve / Reject / Prioritize / Allocate), "
        "a magnitude (number, % or amount), and a horizon (date or window). "
        "NEVER 'understand the market', NEVER 'evaluate options'."
    ),
    "situation": (
        "Uncontroversial — what the audience already knows. If they would dispute it, "
        "demote the claim to Complication. ≤2 sentences, 35 words max."
    ),
    "complication": (
        "What changed and why now. Creates urgency. Names a delta or a window closing. "
        "Connects to the central question implicitly. ≤2 sentences, 35 words max."
    ),
    "resolution": (
        "Single-sentence answer to the central question. Lead with the verb of the "
        "desired decision. Carries the so-what. ≤25 words."
    ),
}


async def sharpen_briefing_field(
    project: dict,
    session_stage_data: dict,
    field: str,
    current_value: str,
) -> dict:
    rules = BRIEFING_FIELD_RULES.get(field, "Tighten without losing meaning. ≤30 words.")
    other_fields = {k: v for k, v in (session_stage_data or {}).items() if k != field and isinstance(v, str)}

    user_prompt = f"""Sharpen the "{field}" field of an engagement briefing.

Field rules:
{rules}

Current value:
"{current_value}"

Other fields already locked (for coherence — do NOT rewrite them):
{json.dumps(other_fields, ensure_ascii=False, indent=2)}

Project: "{project.get("name", "")}"
Audience: {project.get("audience", "")}
Deck type: {project.get("deck_type", "")}

Return JSON exactly:
{{"after": "<tightened value, applying the rules above>",
  "rationale": "<one short sentence explaining what you changed and why>"}}"""

    parsed = await _call_and_parse(user_prompt)
    return {
        "target": "briefing_field",
        "field": field,
        "before": current_value,
        "after": str(parsed.get("after", current_value)).strip().strip('"'),
        "rationale": str(parsed.get("rationale", "")).strip(),
    }


# ────────────────────────────────────────────────────────────────
# slide_full — full slide refresh (action_title + content_json)
# ────────────────────────────────────────────────────────────────

async def sharpen_slide_full(slide: dict, project: dict, research_brief: dict | None = None) -> dict:
    cj = slide.get("content_json", {}) or {}
    brief_excerpt = ""
    if research_brief and research_brief.get("strongest_evidence"):
        ev = research_brief["strongest_evidence"][:6]
        brief_excerpt = "Available research evidence:\n" + "\n".join(f"  - {e}" for e in ev)

    user_prompt = f"""Refresh this slide end-to-end. Apply McKinsey rules:
  - Action title: ≤9 words, contains a verb and a number where possible.
  - Bullets: 3-5 max, each ≤14 words, lead with bold prefix (the so-what fragment).
  - If the slide carries a chart, ensure chart.so_what and chart.source are present.
  - The slide must defend the action title — every bullet must support it.

Current slide:
{json.dumps({"action_title": slide.get("action_title", ""), "slide_type": slide.get("slide_type"), "content_json": cj}, ensure_ascii=False, indent=2)}

Project: "{project.get("name", "")}", audience: {project.get("audience", "")}
{brief_excerpt}

Return JSON exactly:
{{"action_title": "<≤9-word title>",
  "content_json": {{
     "bullets": [{{"bold_prefix": "<so-what fragment>", "text": "<rest of the bullet>"}}, ...],
     "chart":   {{"chart_type": "...", "categories": [...], "series": [...], "so_what": "...", "source": "..."}},
     "so_what": "<1-sentence slide-level so-what>",
     "source":  "<top-level Tier-1 attribution>"
  }},
  "rationale": "<2-sentence summary of what changed and why>"}}

Omit "chart" if the slide is text-only. Preserve fields you don't change rather than dropping them."""

    parsed = await _call_and_parse(user_prompt)
    new_action = str(parsed.get("action_title", slide.get("action_title", ""))).strip().strip('"')
    new_content = parsed.get("content_json") or cj
    if not isinstance(new_content, dict):
        new_content = cj

    # Merge: preserve fields the model dropped (defensive)
    merged_content = dict(cj)
    merged_content.update(new_content)

    return {
        "target": "slide_full",
        "before": {
            "action_title": slide.get("action_title", ""),
            "content_json": cj,
        },
        "after": {
            "action_title": new_action,
            "content_json": merged_content,
        },
        "rationale": str(parsed.get("rationale", "")).strip(),
    }


# ────────────────────────────────────────────────────────────────
# Internal helpers
# ────────────────────────────────────────────────────────────────

async def _call_and_parse(user_prompt: str) -> dict:
    """Invoke the powerful tier model and JSON-parse the response.

    Falls back to an empty dict on parse failure so callers can preserve
    `before` values rather than crashing the request.
    """
    response = await complete(
        system_prompt=EDITOR_SYSTEM,
        user_prompt=user_prompt,
        task="refine",
        temperature=0.4,
    )
    parsed = clean_json_response(response.text)
    if isinstance(parsed, dict):
        return parsed
    return {}


def _compact(value: Any) -> str:
    """Render bullets/categories list compactly for prompt embedding."""
    if not value:
        return "(none)"
    if isinstance(value, list):
        items = []
        for v in value[:6]:
            if isinstance(v, dict):
                items.append(v.get("text") or v.get("name") or json.dumps(v, ensure_ascii=False))
            else:
                items.append(str(v))
        return "; ".join(items)
    return str(value)


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
