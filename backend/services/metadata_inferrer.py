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

Output a SINGLE JSON block (no preamble, no commentary) with EXACTLY these fields:

- `central_question`: the decision-oriented question this deck must answer. Specific, with a subject + verb + decision context. Phrased like a question. Examples: "Should we enter the Brazilian B2B SaaS market in 2026?" or "How should we restructure operations to reduce costs by 25% by 2027?"
- `desired_decision`: the concrete decision the audience must take after reading. Action-oriented. Examples: "Approve a $15M phase-1 investment" or "Authorize the launch of pilots in Sao Paulo and Rio".
- `audience`: ONE of [board, client, working_team, steering] — best inference from report tone and stakes.
- `deck_type`: ONE of [strategic, diagnostic, market_entry, due_diligence, transformation, progress_update, implementation].
- `engagement_template_id`: ONE of [strategic_assessment, commercial_due_diligence, performance_improvement, transformation, market_entry] OR null if none clearly fits. Map: market entry → market_entry; M&A / target evaluation → commercial_due_diligence; cost reduction / efficiency → performance_improvement; digital / org change → transformation; everything else → strategic_assessment.
- `hypothesis`: ONE-sentence "answer first" governing thought, derived from the conclusions section. The deck's executive summary will lead with this. Example: "Brazilian SaaS entry is attractive if we partner with a local distributor to compress GTM by 9 months."
- `output_language`: ISO code (es, en, pt, fr, de, it) — detect from the report content.

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
            system_prompt="You are a senior McKinsey engagement manager. You output strict JSON when asked.",
            user_prompt=user_prompt,
            task="infer_metadata",   # → routes to model_powerful (gemini-3.1-pro)
            max_tokens=900,
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
