"""Infer Stage 1+2 metadata from a parsed deepresearch report.

The deepresearch report does NOT include the user's central question, audience,
or desired decision in its body (the agent's system prompt forbids reproducing
them). So we infer those fields from the title + executive summary + conclusions
using the powerful tier (gemini-3.1-pro).

Cost: ~600 output tokens × $12/M = ~$0.007 per import.
"""
from __future__ import annotations
import json
from dataclasses import dataclass, asdict, field

from .ai_service import complete
from .json_cleaner import clean_json_response
from .report_parser import ParsedReport


@dataclass
class InferredMetadata:
    title: str = ""
    central_question: str = ""
    desired_decision: str = ""
    audience: str = "client"
    deck_type: str = "strategic"
    engagement_template_id: str | None = None
    hypothesis: str = ""
    output_language: str = "en"
    branches: list[dict] = field(default_factory=list)


_INFER_PROMPT = """You are a senior McKinsey engagement manager. A deep research report has been completed for an upcoming client engagement. Based on its title, executive summary, conclusions, and the topics it investigates, infer the engagement metadata that the slide-generation agent will need.

<report>
<title>{title}</title>

<executive_summary>
{exec_summary}
</executive_summary>

<conclusions>
{conclusions}
</conclusions>

<branches_detected>
{branches_json}
</branches_detected>
</report>

Output a SINGLE JSON block (no preamble, no commentary) with EXACTLY these 7 fields. ALL FIELDS ARE REQUIRED — do not output empty strings or null unless the rule below explicitly allows it.

- `central_question` (string, required): the COMPLETE decision-oriented question this deck must answer. Specific, with subject + verb + decision context, ending with `?`. Use the same language as the report. Examples: `"Should we enter the Brazilian B2B SaaS market in 2026 with a $15M phase-1 investment?"` or `"¿Cómo reducir costos operativos 25% para 2027 manteniendo SLA?"`
- `desired_decision` (string, required): the CONCRETE decision the audience must take. Action-verb starter (Approve / Authorize / Reject / Defer). Examples: `"Approve a $15M phase-1 investment in São Paulo operations"` or `"Authorize Phase 2 detailed design for the 3 prioritized initiatives"`
- `audience` (string, required): ONE of [board, client, working_team, steering] — pick by stakes and tone (board = strategic + investment; client = external recommendation; working_team = implementation detail; steering = governance review)
- `deck_type` (string, required): ONE of [strategic, diagnostic, market_entry, due_diligence, transformation, progress_update, implementation]
- `engagement_template_id` (string, required — NEVER null when the report has a clear theme): pick the BEST FIT from [strategic_assessment, commercial_due_diligence, performance_improvement, transformation, market_entry]. Mapping rules:
    - Report mentions "entry", "TAM", "go-to-market", "competitors", "expansion" → `market_entry`
    - Report mentions "due diligence", "target", "M&A", "acquisition", "valuation" → `commercial_due_diligence`
    - Report mentions "cost reduction", "efficiency", "performance gap", "operational improvement" → `performance_improvement`
    - Report mentions "digital", "transformation", "org change", "future state", "roadmap" → `transformation`
    - Anything else → `strategic_assessment`
- `hypothesis` (string, required): the ONE-SENTENCE answer-first governing thought. Pull from Conclusiones / Recomendaciones. Specific verb + condition + payoff. Example: `"Brazilian SaaS entry is attractive if we partner with a local BPO to compress go-to-market by 9 months and limit downside FX exposure."`
- `output_language` (string, required): ISO code matching the LANGUAGE OF THE REPORT BODY (not English by default). Inspect the executive summary and conclusions text:
    - Spanish words like "el", "la", "del", "que", "para", "mercado", "podemos" → `"es"`
    - English → `"en"`. Portuguese → `"pt"`. French → `"fr"`. German → `"de"`.
    - When in doubt, look at the H2 headings: `## Resumen Ejecutivo` / `## Conclusiones` → Spanish.

```json
{{"central_question": "...", "desired_decision": "...", "audience": "...", "deck_type": "...", "engagement_template_id": "...", "hypothesis": "...", "output_language": "..."}}
```
"""


async def infer_metadata(report: ParsedReport) -> InferredMetadata:
    """Run gemini-3.1-pro to infer Stage 1+2 metadata. Falls back to defaults on error."""
    fallback = InferredMetadata(
        title=report.title,
        branches=_branches_for_inferred(report.branches),
    )

    if not report.exec_summary and not report.conclusions and not report.branches:
        # Nothing to infer from — return defaults so user fills the form manually
        fallback.central_question = report.title
        return fallback

    branches_json = json.dumps(
        [{"question": b["question"]} for b in report.branches[:8]],
        ensure_ascii=False,
    )
    user_prompt = _INFER_PROMPT.format(
        title=report.title,
        exec_summary=(report.exec_summary or "(not provided)")[:2000],
        conclusions=(report.conclusions or report.recommendations or "(not provided)")[:2000],
        branches_json=branches_json,
    )

    try:
        response = await complete(
            system_prompt="You are a senior McKinsey engagement manager. You output strict JSON when asked, with ALL requested fields filled.",
            user_prompt=user_prompt,
            task="infer_metadata",   # → routes to model_powerful (gemini-3.1-pro)
            max_tokens=1500,
            temperature=0.3,
        )
    except Exception as e:
        print(f"[metadata_inferrer] LLM call failed: {e}")
        return fallback

    raw_text = response.text if hasattr(response, "text") else str(response)
    parsed = clean_json_response(raw_text)
    if not isinstance(parsed, dict):
        print(f"[metadata_inferrer] Could not parse LLM JSON, returning fallback. Raw: {raw_text[:200]}")
        return fallback

    return InferredMetadata(
        title=report.title,
        central_question=str(parsed.get("central_question") or report.title).strip(),
        desired_decision=str(parsed.get("desired_decision") or "").strip(),
        audience=_validate_choice(
            parsed.get("audience"), {"board", "client", "working_team", "steering"}, "client",
        ),
        deck_type=_validate_choice(
            parsed.get("deck_type"),
            {"strategic", "diagnostic", "market_entry", "due_diligence",
             "transformation", "progress_update", "implementation"},
            "strategic",
        ),
        engagement_template_id=_validate_template(parsed.get("engagement_template_id")),
        hypothesis=str(parsed.get("hypothesis") or "").strip(),
        output_language=_validate_choice(
            parsed.get("output_language"),
            {"es", "en", "pt", "fr", "de", "it"},
            "en",
        ),
        branches=_branches_for_inferred(report.branches),
    )


def _validate_choice(value, allowed: set[str], default: str) -> str:
    if isinstance(value, str) and value.lower() in allowed:
        return value.lower()
    return default


def _validate_template(value) -> str | None:
    allowed = {
        "strategic_assessment", "commercial_due_diligence",
        "performance_improvement", "transformation", "market_entry",
    }
    if isinstance(value, str) and value.lower() in allowed:
        return value.lower()
    return None


def _branches_for_inferred(parsed_branches: list[dict]) -> list[dict]:
    """Convert ParsedReport.branches into Stage-2-compatible structure.

    Stage 2 expects each branch to be {question, evidence, so_what}. We map
    the parsed branch's content as `evidence` (so the orchestrator's Stage 3
    prompt sees real content), and leave so_what blank for the AI to derive.
    """
    out: list[dict] = []
    for b in parsed_branches[:8]:  # cap at 8 to avoid prompt bloat
        evidence = (b.get("content") or "").strip()
        # Trim to ~600 chars so the stage_data JSON stays manageable
        if len(evidence) > 600:
            evidence = evidence[:600].rsplit(" ", 1)[0] + "…"
        out.append({
            "question": b.get("question", ""),
            "evidence": evidence,
            "so_what": "",
        })
    return out


def to_dict(meta: InferredMetadata) -> dict:
    return asdict(meta)
