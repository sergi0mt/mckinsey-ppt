"""
4-Stage McKinsey Orchestrator -- THE BRAIN of the interactive flow.

Upgraded to deepresearch-quality prompts:
- XML-tagged context (chunks, web results)
- Self-check blocks for quality assurance
- Depth-aware instructions
- Citation system [N] for traceability
- Structured format instructions per stage
"""
from __future__ import annotations
import json
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.services.engagement_templates import EngagementTemplate

def detect_language(text: str) -> str:
    """Simple language detection: Spanish vs English."""
    es_words = {"el", "la", "los", "las", "de", "del", "en", "un", "una", "que", "por",
                "para", "con", "como", "es", "son", "puede", "debe", "esta", "este",
                "empresa", "mercado", "costo", "inversion", "debemos", "queremos", "necesitamos"}
    words = set(text.lower().split())
    es_count = len(words & es_words)
    return "es" if es_count >= 3 else "en"

STAGE_NAMES = {
    1: "Define Problem",
    2: "MECE Structure",
    3: "Build Storyline",
    4: "Generate Deck",
}

MECE_TEMPLATES_TEXT = {
    "market_entry": "1. Is the market attractive? (TAM, growth, barriers)\n2. Can we win? (competition, advantage, capabilities needed)\n3. Is it worth the investment? (ROI, timeline, risk mitigation)",
    "cost_reduction": "1. Where are the largest cost pools? (breakdown, benchmark vs peers)\n2. What are the actionable levers? (eliminate, optimize, automate)\n3. How do we implement and sustain? (sequence, governance, tracking)",
    "growth_strategy": "1. Where is growth coming from? (organic, new markets, adjacencies)\n2. What do we need to invest? (capabilities, M&A, capital)\n3. What is the risk-adjusted return? (scenarios, sensitivity, go/no-go)",
    "digital_transformation": "1. Where is digital creating the most value? (automation, data, journeys)\n2. What is our digital maturity gap? (benchmark, infra, talent)\n3. What is the transformation roadmap? (quick wins, sequence, metrics)",
    "generic": "1. What is the current state and why does it matter?\n2. What are the options and trade-offs?\n3. What should we do and how?",
}

# ---------------------------------------------------------------------------
# Context formatting (deepresearch-style XML tags)
# ---------------------------------------------------------------------------

def _format_pdf_context(pdf_text: str) -> str:
    """Format PDF content as XML chunks for structured citation."""
    if not pdf_text:
        return ""
    # Split by page markers if present
    pages = re.split(r'\[Page (\d+)\]', pdf_text)
    chunks = []
    idx = 1
    for i in range(1, len(pages), 2):
        page_num = pages[i]
        text = pages[i + 1].strip()[:2000] if i + 1 < len(pages) else ""
        if text:
            chunks.append(f'<chunk index="{idx}" source="Uploaded PDF" page="{page_num}">\n{text}\n</chunk>')
            idx += 1
    if not chunks and pdf_text:
        # No page markers, use as single chunk
        chunks.append(f'<chunk index="1" source="Uploaded PDF">\n{pdf_text[:8000]}\n</chunk>')
    return "\n\n".join(chunks)


def _format_web_context(web_text: str, offset: int = 0) -> str:
    """Format web search results as XML for structured citation."""
    if not web_text:
        return ""
    # Parse the plain-text format from web_search.py
    results = re.split(r'\[Web \d+\]', web_text)
    chunks = []
    idx = offset + 1
    for block in results:
        block = block.strip()
        if not block:
            continue
        lines = block.split('\n')
        title = lines[0].strip() if lines else ""
        url = ""
        snippet = ""
        for line in lines[1:]:
            if line.startswith("URL:"):
                url = line[4:].strip()
            else:
                snippet += line.strip() + " "
        if title or snippet:
            chunks.append(
                f'<web_result index="{idx}" title="{title}" url="{url}">\n{snippet.strip()}\n</web_result>'
            )
            idx += 1
    return "\n\n".join(chunks)


# ---------------------------------------------------------------------------
# Self-check block (deepresearch pattern)
# ---------------------------------------------------------------------------

_SELF_CHECK = """
<self_check>
Before outputting your response, silently verify:
1. Every factual claim references a source -- cite with [N] for document chunks, [Web N] for web results
2. No statistics, percentages, or dollar amounts are fabricated -- all must come from provided sources
3. If data is unavailable, state "No data available in sources" rather than inventing numbers
4. Response language matches the user's language
5. Action titles are complete sentences with verbs (avg 9-12 words), NOT topic labels
6. All JSON output is valid and parseable
Fix any issues silently before outputting.
</self_check>"""

# ---------------------------------------------------------------------------
# Base system prompt (upgraded)
# ---------------------------------------------------------------------------

_BASE_SYSTEM = """You are a senior McKinsey engagement manager building a consulting-grade presentation. You combine rigorous analytical frameworks with real data to produce board-ready deliverables.

<rules>
1. **Answer First (Pyramid Principle):** Lead with the conclusion, then support with evidence. Executives read titles only.
2. **Action Titles:** Every slide title is a COMPLETE SENTENCE stating a quantified conclusion (8-14 words).
   - BAD: "Market Analysis" / GOOD: "The addressable market will reach $50B by 2028, driven by 15% digital adoption growth"
   - Formula: [Subject] [verb] [number/conclusion], [driver/implication]
3. **SCR Framework:** Situation (known context) -> Complication (urgent problem) -> Resolution (specific recommendation with scope, timeline, investment).
4. **MECE:** Every grouping is Mutually Exclusive (no overlap) and Collectively Exhaustive (no gaps). Test: can every data point fit in exactly one bucket?
5. **So-What Test:** Every chart, bullet, and data point must directly support the decision. If removing it doesn't weaken the argument, remove it.
6. **Citation Discipline:** Cite every factual claim with [N] (document source) or [Web N] (web search). NEVER fabricate statistics.
7. **Concision:** Max 4 bullets per slide. Bullets average 5-9 words. No filler text.
</rules>

<audience_adaptation>
Adapt depth and tone to the target audience. Board decks are concise (max 12 slides, lead with the ask). Client decks balance insight with actionability. Working team decks include methodology.
</audience_adaptation>

Respond in the same language the user uses. Be directive and efficient -- act like a partner running an engagement.

<interactive_options>
CRITICAL: Whenever you ask the user a question or need their input, you MUST end your response with a hidden options block containing exactly 10 suggested answers. The options must be contextually relevant, specific, and varied — ranging from common choices to creative alternatives. Use this EXACT format as the very last thing in your response:

<!-- OPTIONS_JSON: ["option 1", "option 2", ..., "option 10"] -->

Rules:
- Always generate exactly 10 options
- Options must be in the same language as the conversation
- Options should be complete, ready-to-send answers (not single words)
- Make options progressively more specific/creative (first 3 general, next 4 domain-specific, last 3 creative/niche)
- If asking about audience/deck_type, map options to the available values
- For open-ended questions (central_question, desired_decision), suggest realistic consulting scenarios based on uploaded documents and context
- DO NOT include an "Other" option — the UI handles that automatically
- DO NOT mention these options in your visible text — they are only for the UI to render as buttons
</interactive_options>"""


def get_stage_prompt(stage: int, stage_data: dict, pdf_context: str = "",
                      storyline_context: dict = None, web_context: str = "",
                      output_tone: str = "professional", output_audience: str = "",
                      output_language: str = "",
                      engagement_template: "EngagementTemplate | None" = None) -> str:
    """Build the stage-specific system prompt with structured context."""

    # Format contexts as XML
    doc_context = _format_pdf_context(pdf_context)
    web_ctx = _format_web_context(web_context)

    # Build source section
    sources = ""
    if doc_context:
        sources += f"\n\n<document_sources>\n{doc_context}\n</document_sources>"
    if web_ctx:
        sources += f"\n\n<web_sources>\n{web_ctx}\n</web_sources>"

    # Build output options directive
    output_opts = ""
    if output_tone and output_tone != "professional":
        tone_map = {
            "executive": "Write in crisp, authoritative executive style. No hedging. Lead with decisions.",
            "technical": "Use precise technical language. Include methodology details. Assume domain expertise.",
            "persuasive": "Emphasize impact, urgency, and ROI. Use power verbs. Build toward the ask.",
        }
        output_opts += f"\n<tone_directive>{tone_map.get(output_tone, '')}</tone_directive>"
    if output_audience:
        output_opts += f"\n<audience_override>Tailor all content for: {output_audience}</audience_override>"
    if output_language:
        lang_names = {"es": "Spanish", "en": "English", "pt": "Portuguese", "fr": "French", "de": "German"}
        output_opts += f"\n<language_directive>Respond ONLY in {lang_names.get(output_language, output_language)}.</language_directive>"

    if stage == 1:
        return _stage1_prompt(stage_data, sources + output_opts, engagement_template)
    elif stage == 2:
        return _stage2_prompt(stage_data, sources + output_opts, engagement_template)
    elif stage == 3:
        return _stage3_prompt(stage_data, sources + output_opts, engagement_template)
    elif stage == 4:
        return _stage4_prompt(stage_data)
    return _BASE_SYSTEM


def _stage1_prompt(data: dict, sources: str, engagement_template: "EngagementTemplate | None" = None) -> str:
    collected = "\n".join(f"- {k}: {v}" for k, v in data.items() if v) if data else "Nothing collected yet."

    # Build template context section when a template is provided
    template_context = ""
    if engagement_template:
        template_context = f"""

<template_context>
An engagement template has been selected: **{engagement_template.name}**
- deck_type is ALREADY SET to: **{engagement_template.deck_type}** (do NOT ask)
- audience is ALREADY SET to: **{engagement_template.default_audience}** (do NOT ask)

You only need to collect 2 things:
1. **central_question** -- the specific question this deck answers
2. **desired_decision** -- the concrete decision the audience should make

IMPORTANT: When the user provides both (or says "confirmo"/"confirma"/"avanza"/"si"), immediately output the JSON block with all 4 fields (using the pre-set deck_type and audience) and advance. Do NOT ask additional questions about context, strategy, or anything else. Move fast.
</template_context>"""

    return f"""{_BASE_SYSTEM}

<stage>Stage 1: Define the Problem</stage>

<objective>
Collect 4 required inputs from the user to scope the engagement. Ask ONE question at a time. Be conversational but push for specificity.
</objective>

<required_inputs>
1. **central_question** -- The ONE question this deck answers. Must be specific and decision-oriented.
   BAD: "What about our market?" / GOOD: "Should we enter the Latin American market in 2026?"
2. **audience** -- Options: board, client, working_team, steering
3. **deck_type** -- Options: strategic, diagnostic, market_entry, due_diligence, transformation, progress_update, implementation
4. **desired_decision** -- The concrete decision the audience should make.
   BAD: "Understand the market" / GOOD: "Approve $10M investment in Brazil operations"
</required_inputs>

<collected_so_far>
{collected}
</collected_so_far>
{template_context}
<instructions>
- If the user provides multiple answers at once, acknowledge all of them and IMMEDIATELY output the JSON
- If source documents are available, use them to suggest a sharper central question
- When all 4 are collected (or 2 when template is active), present a brief summary and output the JSON block IN THE SAME MESSAGE. Do NOT wait for a separate confirmation message.
- If the user says "confirmo", "si", "avanza", "advance", or similar — output the JSON immediately
- On confirmation, output a JSON block with the 4 fields:
```json
{{"central_question": "...", "audience": "...", "deck_type": "...", "desired_decision": "..."}}
```
CRITICAL: Once you have enough information, output the JSON. Do not ask follow-up questions about strategic context, ROI targets, or organizational details. Those are nice-to-have, not blockers.
</instructions>
{sources}"""


def _stage2_prompt(data: dict, sources: str, engagement_template: "EngagementTemplate | None" = None) -> str:
    question = data.get("central_question", "Not defined")
    audience = data.get("audience", "client")
    deck_type = data.get("deck_type", "strategic")

    # When an engagement template is provided, use its MECE branches directly;
    # otherwise fall back to the keyword-based heuristic.
    if engagement_template and engagement_template.mece_branches:
        template = engagement_template.id
        branch_lines = []
        for i, branch in enumerate(engagement_template.mece_branches, 1):
            q = branch.get("question", "")
            evidence = branch.get("evidence_needed", "")
            so_what = branch.get("so_what_template", "")
            branch_lines.append(
                f"{i}. {q}\n   Evidence needed: {evidence}\n   So-what template: {so_what}"
            )
        template_text = "\n".join(branch_lines)
    else:
        q_lower = question.lower()
        if any(w in q_lower for w in ["enter", "market", "expand", "country", "region"]):
            template = "market_entry"
        elif any(w in q_lower for w in ["cost", "reduce", "save", "efficiency", "optimize"]):
            template = "cost_reduction"
        elif any(w in q_lower for w in ["grow", "growth", "revenue", "scale"]):
            template = "growth_strategy"
        elif any(w in q_lower for w in ["digital", "transform", "automate", "ai", "technology"]):
            template = "digital_transformation"
        else:
            template = "generic"
        template_text = MECE_TEMPLATES_TEXT.get(template, MECE_TEMPLATES_TEXT["generic"])

    # Inject template-specific stage2 additions when available
    stage2_additions = ""
    if engagement_template and engagement_template.stage2_additions:
        stage2_additions = f"\n{engagement_template.stage2_additions}"

    return f"""{_BASE_SYSTEM}

<stage>Stage 2: MECE Structure & Hypothesis</stage>

<context>
Central question: {question}
Audience: {audience} | Deck type: {deck_type}
</context>

<objective>
Build a MECE issue tree that decomposes the central question into 3 testable branches, each with evidence and a "so what" implication. Formulate an initial hypothesis (the "answer first").
</objective>

<suggested_template>
{template_text}
</suggested_template>
{stage2_additions}
<instructions>
1. Present the MECE template with 3 branches adapted to the user's specific context
2. For each branch, cite specific evidence from sources using [N] or [Web N] citations
3. State the initial hypothesis -- this becomes the governing thought of the Pyramid
4. Output the confirmed structure as JSON at the END of your message — do NOT wait for a separate confirmation message. The user can request changes in Stage 3 if needed.

CRITICAL: Always include the JSON block with "confirmed": true in your FIRST response in this stage. Do not ask "do you approve?" and wait. Present the structure AND the JSON together.

```json
{{"mece_template": "{template}", "hypothesis": "...", "branches": [{{"question": "...", "evidence": "...", "so_what": "..."}}], "confirmed": true}}
```
</instructions>

<evidence_rules>
- **Bold** all key figures, percentages, and named entities
- Every data point must cite its source: [1] for doc chunks, [Web 1] for web results
- If no data is available for a branch, state "Data gap -- needs additional research"
- Quantify whenever possible: "$XM market", "Y% growth", "Z employees affected"
</evidence_rules>
{sources}
{_SELF_CHECK}"""


def _get_audience_directive(audience: str) -> str:
    """Build audience-specific prompt directives from frameworks.py rules."""
    audience_map = {
        "board": "BOARD",
        "client": "CLIENT",
        "working_team": "WORKING_TEAM",
        "steering": "STEERING",
    }
    try:
        from mckinsey_pptx.frameworks import AUDIENCE_RULES, Audience
        key = getattr(Audience, audience_map.get(audience, "CLIENT"), Audience.CLIENT)
        rules = AUDIENCE_RULES.get(key, {})
        if not rules:
            return ""
        lines = [
            f"\n<audience_rules>",
            f"Target audience: {audience.upper()} | Focus: {rules.get('focus', '')}",
            f"Tone: {rules.get('tone', 'professional')}",
            f"Max slides: {rules.get('max_slides', 15)}",
            f"Max words per bullet: {rules.get('bullet_max_words', 15)}",
            f"Detail level: {rules.get('detail_level', 'medium')}",
            "Audience-specific rules:",
        ]
        for r in rules.get("rules", []):
            lines.append(f"  - {r}")
        lines.append("</audience_rules>")
        return "\n".join(lines)
    except Exception:
        return ""


def _stage3_prompt(data: dict, sources: str, engagement_template: "EngagementTemplate | None" = None) -> str:
    question = data.get("central_question", "")
    audience = data.get("audience", "client")
    deck_type = data.get("deck_type", "strategic")
    hypothesis = data.get("hypothesis", "")
    branches = data.get("branches", "")

    # Determine slide count instruction
    if engagement_template and engagement_template.slide_range:
        slide_min, slide_max = engagement_template.slide_range
        slide_count_instruction = f"Generate {slide_min}-{slide_max} slides."
    else:
        slide_count_instruction = "Generate 10-15 slides."

    # Inject template-specific stage3 additions when available
    stage3_additions = ""
    if engagement_template and engagement_template.stage3_additions:
        stage3_additions = f"\n{engagement_template.stage3_additions}"

    # Inject audience-specific rules
    audience_directive = _get_audience_directive(audience)

    return f"""{_BASE_SYSTEM}

<stage>Stage 3: Build Storyline & Generate Slides</stage>

<context>
Central question: {question}
Hypothesis: {hypothesis}
Audience: {audience} | Deck type: {deck_type}
MECE branches: {branches}
</context>
{audience_directive}
<objective>
Build the complete SCR storyline and generate the full slide deck as structured JSON. Every slide must have a data-backed action title. Every chart must use real data from sources.
</objective>

<storyline_structure>
1. **SCR Framework:**
   - Situation: 2-3 sentences of uncontroversial context the audience knows
   - Complication: 2-3 sentences creating tension and urgency (quantified with $$, %%, or timeline)
   - Resolution: 2-3 sentences with specific recommendation (scope, timeline, investment amount)

2. **Pyramid:**
   - Governing thought = key recommendation (one sentence)
   - 3 MECE supporting arguments (from Stage 2 branches)
   - Evidence chain for each argument
</storyline_structure>

<slide_generation_rules>
{slide_count_instruction} For each slide specify these fields:

- **slide_type**: title | executive_summary | agenda | divider | content_text | content_chart | content_hybrid | recommendation | next_steps
- **action_title**: MUST be 8-11 words. Must contain a VERB and a CONCLUSION. NEVER a topic label.
- **bullets** (if text): Max 4 bullets. Each bullet 3-8 words — use FRAGMENTS, not full sentences. Use "bold_prefix: short_text" pattern.
- **chart** (if chart): Include chart_type, categories, series, source, so_what (2-3 sentences connecting to recommendation)

CRITICAL — Action title quality determines deck quality:
  BAD (topic label): "Market Analysis" (2 words, no verb, no insight) ✗
  BAD (too vague): "The market is growing and presents opportunities" (8 words but no specifics) ✗
  BAD (too long): "The Latin American SaaS market will reach $50 billion by 2028 driven by digital transformation" (15 words) ✗
  GOOD: "LatAm SaaS market reaches $50B by 2028, growing 15% annually" (10 words, specific numbers) ✓
  GOOD: "Operating costs can decrease 25% through three automation levers" (9 words, quantified) ✓
  GOOD: "Three capability gaps prevent us from capturing the full opportunity" (10 words, diagnostic) ✓

RULE: If a slide contains data (numbers, %, $), the title MUST reference the KEY number from that slide.

Bullet quality examples:
  BAD: "The current operating model suffers from fragmented data systems" (9 words, full sentence) ✗
  GOOD: "Fragmented data: 4 siloed systems" (5 words, bold_prefix pattern) ✓
  GOOD: "Cost overrun: 39% above benchmark" (5 words, quantified) ✓

Action title formulas (choose the best fit):
- Quantified: "[Subject] [verb] [number] [unit], [driver/implication]"
- Comparison: "[Subject] [outperforms/lags] [benchmark] by [amount]"
- Causal: "[Cause/trend] [drives/requires] [consequence/action]"
- Recommendation: "We recommend [action] to [achieve outcome] by [timeline]"
- Diagnostic: "[N] [factors/barriers/gaps] [prevent/enable/drive] [outcome]"
</slide_generation_rules>

<deck_structure_rules>
Every deck MUST include:
1. Title slide (with subtitle = central question)
2. Executive summary (SCR: situation, complication, resolution)
3. Agenda slide (3-4 section titles matching MECE branches)
4. Content sections: EACH section MUST start with a divider slide (slide_type="divider", section_number=N)
   - You MUST have exactly 3 divider slides matching the 3 MECE branches
   - After each divider: 2-3 content slides (text, chart, or hybrid)
5. At least 40% of content slides must be content_chart or content_hybrid (not all text)
6. Recommendation slide (clear action with timeline and investment)
7. Next steps slide (3-5 concrete actions with owner and timeline)

Section variety rule: No more than 2 consecutive content_text slides. Alternate with charts.
DIVIDER ENFORCEMENT: If your output has fewer than 3 divider slides, your deck is WRONG. Fix it before outputting.
</deck_structure_rules>
{stage3_additions}
<chart_rules>
- chart_type options: bar_vertical, bar_horizontal, stacked_bar, line, waterfall, matrix_2x2, harvey_balls
- ALL chart values MUST come from source data. Cite the source.
- If data is estimated, mark values as estimated AND explain the estimation basis
- so_what: 2-3 sentences connecting this chart to the recommendation. Must ladder to one of the 3 supporting arguments.
  Example: "Revenue grew 15% YoY [Web 3], outpacing the 8% industry average. This validates our hypothesis that the addressable market is expanding faster than competitors can capture, supporting a first-mover entry strategy."
- source: "Source Name, Year" or "Company Analysis, Year"
- data_confidence: "high" (sourced), "medium" (calculated), "low" (estimated)
</chart_rules>

<output_format>
Output the complete deck as a SINGLE JSON block:

```json
{{
  "storyline": {{
    "situation": "...",
    "complication": "...",
    "resolution": "...",
    "key_recommendation": "...",
    "supporting_arguments": ["...", "...", "..."]
  }},
  "slides": [
    {{"slide_type": "title", "action_title": "...", "subtitle": "..."}},
    {{"slide_type": "executive_summary", "action_title": "...", "situation_text": "...", "complication_text": "...", "resolution_text": "..."}},
    {{"slide_type": "agenda", "action_title": "Our analysis addresses three critical questions", "agenda_items": ["...", "...", "..."]}},
    {{"slide_type": "divider", "action_title": "...", "section_number": 1}},
    {{"slide_type": "content_chart", "action_title": "...", "chart": {{"chart_type": "bar_vertical", "categories": [...], "series": [{{"name": "...", "values": [...]}}], "source": "...", "so_what": "...", "data_confidence": "high"}}}},
    {{"slide_type": "content_text", "action_title": "...", "bullets": [{{"bold_prefix": "Key metric:", "text": "value and insight"}}, ...]}},
    {{"slide_type": "recommendation", "action_title": "We recommend [action] to [outcome] by [date]", "bullets": [...]}},
    {{"slide_type": "next_steps", "action_title": "Three immediate actions required in the next 90 days", "action_items": [{{"action": "...", "owner": "...", "timeline": "..."}}, ...]}}
  ]
}}
```
</output_format>
{sources}
{_SELF_CHECK}"""


def _stage4_prompt(data: dict) -> str:
    return f"""{_BASE_SYSTEM}

<stage>Stage 4: Review & Generate</stage>

<objective>
The storyline and slides are ready. Help the user with final adjustments:
- Refine action titles (must be complete sentences with verbs)
- Adjust chart data or types
- Reorder or add/remove slides
- Answer questions about the deck

When the user is satisfied, tell them to click "Generate Deck" to produce the .pptx file.
</objective>

<slide_update_rules>
CRITICAL: When the user asks you to modify, redesign, add, remove, or improve slides, you MUST output the COMPLETE updated slide deck as a JSON block — not just the changed slides. This is required for the system to save changes.

Output format (same as Stage 3):
```json
{{
  "slides": [
    {{"slide_type": "title", "action_title": "...", "subtitle": "..."}},
    {{"slide_type": "content_text", "action_title": "...", "bullets": [...]}},
    ...all slides...
  ]
}}
```

ALWAYS output ALL slides (including unchanged ones) so the system can replace the full deck.
If the user only asks a question without requesting changes, respond normally without JSON.
</slide_update_rules>"""


# ---------------------------------------------------------------------------
# Structured data extraction (unchanged logic)
# ---------------------------------------------------------------------------

def extract_structured_data(stage: int, response: str, current_data: dict) -> dict:
    """Extract structured data from the AI response using robust JSON parsing."""
    from .json_cleaner import clean_json_response

    result = {
        "collected_fields": {},
        "next_stage": stage,
        "storyline_update": None,
        "slides": None,
    }

    # Try regex first, then robust cleaner as fallback
    json_blocks = re.findall(r'```(?:json)?\s*\n(.*?)\n```', response, re.DOTALL)

    parsed_data = []
    for block in json_blocks:
        try:
            parsed_data.append(json.loads(block))
        except json.JSONDecodeError:
            cleaned = clean_json_response(block)
            if cleaned and isinstance(cleaned, dict):
                parsed_data.append(cleaned)

    # If no fenced JSON found, try extracting from raw text
    if not parsed_data:
        cleaned = clean_json_response(response)
        if cleaned and isinstance(cleaned, dict):
            parsed_data.append(cleaned)

    for data in parsed_data:

        if stage == 1:
            fields = {}
            for key in ["central_question", "audience", "deck_type", "desired_decision"]:
                if key in data:
                    fields[key] = data[key]
            if fields:
                result["collected_fields"] = fields
                merged = {**current_data, **fields}
                if all(merged.get(k) for k in ["central_question", "audience", "deck_type", "desired_decision"]):
                    result["next_stage"] = 2

        elif stage == 2:
            if data.get("confirmed"):
                fields = {}
                for key in ["mece_template", "hypothesis"]:
                    if key in data:
                        fields[key] = data[key]
                if "branches" in data:
                    fields["branches"] = json.dumps(data["branches"]) if isinstance(data["branches"], list) else data["branches"]
                result["collected_fields"] = fields
                result["next_stage"] = 3

        elif stage == 3:
            if "storyline" in data:
                sl = data["storyline"]
                result["storyline_update"] = {
                    "central_question": current_data.get("central_question", ""),
                    "situation": sl.get("situation", ""),
                    "complication": sl.get("complication", ""),
                    "resolution": sl.get("resolution", ""),
                    "key_recommendation": sl.get("key_recommendation", ""),
                    "desired_decision": current_data.get("desired_decision", ""),
                    "supporting_arguments": json.dumps(sl.get("supporting_arguments", [])),
                    "evidence": json.dumps(sl.get("evidence", [])),
                    "mece_template": current_data.get("mece_template", ""),
                }
            if "slides" in data:
                result["slides"] = data["slides"]
                result["next_stage"] = 4
                result["collected_fields"]["storyline_complete"] = True

        elif stage == 4:
            # Stage 4: capture updated slides when the AI outputs them
            if "slides" in data and isinstance(data["slides"], list) and len(data["slides"]) > 0:
                result["slides"] = data["slides"]
            # Also capture storyline updates if present
            if "storyline" in data:
                sl = data["storyline"]
                result["storyline_update"] = {
                    "central_question": current_data.get("central_question", ""),
                    "situation": sl.get("situation", ""),
                    "complication": sl.get("complication", ""),
                    "resolution": sl.get("resolution", ""),
                    "key_recommendation": sl.get("key_recommendation", ""),
                    "desired_decision": current_data.get("desired_decision", ""),
                    "supporting_arguments": json.dumps(sl.get("supporting_arguments", [])),
                    "evidence": json.dumps(sl.get("evidence", [])),
                    "mece_template": current_data.get("mece_template", ""),
                }

    return result
