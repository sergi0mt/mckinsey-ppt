"""Generate a DeepResearch-style slide deck from a parsed report.

Port of the `/presentation` endpoint from sergi0mt/deepresearch
(backend/app/api/agent.py L7437-7712). The prompt + helpers are reproduced
~verbatim so the output JSON shape matches; only the model client wiring is
swapped for mckinsey-ppt's `ai_service`.

The result is a list of Slide objects (dicts here) — NOT a PPTX. The frontend
renders them as HTML; we also expose a "Export to simple PPTX" path.
"""
from __future__ import annotations
import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from typing import AsyncIterator, Literal

from pydantic import BaseModel, Field

from .ai_service import complete, stream_response
from .json_cleaner import clean_json_response
from .theme_palettes import _resolve_palette

logger = logging.getLogger(__name__)


# ─── Public schemas (used by router) ──────────────────────────────────────────


class PresentationOptions(BaseModel):
    """Subset of deepresearch's OutputOptions that is meaningful for slides.

    `length` is intentionally excluded — slides are bounded by `slide_count`,
    not word-count. `use_web` / `use_sources` are also dropped (the report
    itself is the source of truth in our flow).
    """
    tone: str = "profesional"        # profesional | casual | técnico | académico | ejecutivo
    audience: str = "general"        # general | experto | ejecutivo | estudiante
    language: str | None = None       # ISO code; None = match the report
    focus: str | None = None          # free-text "emphasize X"
    style_id: str = "default"         # one of THEME_PALETTES keys
    style_mode: Literal["dark", "light", "dim", "auto"] = "dark"


class PresentationRequest(BaseModel):
    report: str                       # full text of the imported report
    objective: str                    # central question / decision context
    slide_count: int = 10             # clamped to [5, 20]
    focus: str | None = None
    product_context: dict | None = None
    output_options: PresentationOptions = Field(default_factory=PresentationOptions)
    image_provider: Literal["none", "pexels", "unsplash", "ai"] = "none"


@dataclass
class Slide:
    index: int
    title: str
    layout: str
    content: list
    notes: str = ""
    highlight: str = ""
    image_query: str = ""
    image_url: str = ""
    accent_color: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> "Slide":
        """Permissive constructor — coerces None → '', missing keys → defaults."""
        return cls(
            index=int(d.get("index", 0) or 0),
            title=str(d.get("title", "") or ""),
            layout=str(d.get("layout", "bullets") or "bullets"),
            content=list(d.get("content", []) or []),
            notes=str(d.get("notes", "") or ""),
            highlight=str(d.get("highlight", "") or ""),
            image_query=str(d.get("image_query", "") or ""),
            image_url=str(d.get("image_url", "") or ""),
            accent_color=str(d.get("accent_color", "") or ""),
        )

    def to_dict(self) -> dict:
        return {
            "index": self.index, "title": self.title, "layout": self.layout,
            "content": self.content, "notes": self.notes, "highlight": self.highlight,
            "image_query": self.image_query, "image_url": self.image_url,
            "accent_color": self.accent_color,
        }


# ─── Helpers ported from agent.py ─────────────────────────────────────────────


_TONE_GUIDE = {
    "profesional": (
        "OBLIGATORIO: Tono formal pero CLARO Y DIRECTO. Frases ≤25 palabras. "
        "Voz activa preferida. PROHIBIDOS: adverbios vacíos ('orgánicamente', "
        "'sistémicamente'), nominalizaciones rebuscadas, neologismos pomposos. "
        "Usa terminología sectorial estándar (CAPEX, EBITDA, SWOT, etc.). "
        "Test: un ejecutivo sin doctorado entiende cada slide en primera lectura."
    ),
    "casual": "OBLIGATORIO: Tono conversacional y cercano. Tú, analogías, expresiones coloquiales. Evita jerga.",
    "técnico": (
        "OBLIGATORIO: Tono técnico PRECISO (no barroco). Terminología estándar exacta del campo. "
        "Frases cortas claras. Sin neologismos inventados."
    ),
    "académico": (
        "OBLIGATORIO: Tono académico RIGUROSO pero CLARO. Referencias formales [N]. "
        "Frases ≤40 palabras. Sin prosa barroca."
    ),
    "ejecutivo": (
        "OBLIGATORIO: Tono ejecutivo directo. KPIs, métricas, ROI, riesgos, acciones. "
        "Sin desarrollo narrativo extenso. Sin jerga académica."
    ),
}

_AUDIENCE_GUIDE = {
    "general": "Para público general sin conocimiento previo. Explica conceptos básicos y evita jerga sin explicar.",
    "experto": "Para especialistas del campo. Asume conocimiento técnico avanzado. No expliques lo obvio.",
    "ejecutivo": "Para tomadores de decisiones C-level. Foco en impacto estratégico, costos, riesgos y ROI.",
    "estudiante": "Para estudiantes universitarios. Pedagógico: explica conceptos, usa analogías, incluye definiciones.",
}


def _build_output_options_context(opts: PresentationOptions | None) -> str:
    """Mirror of deepresearch's _build_output_options_context, adapted for slides."""
    if not opts:
        return ""
    parts = ["\n<opciones_de_salida>"]
    parts.append(f"- Tono: {opts.tone} → {_TONE_GUIDE.get(opts.tone, '')}")
    parts.append(f"- Audiencia: {opts.audience} → {_AUDIENCE_GUIDE.get(opts.audience, '')}")
    if opts.language:
        parts.append(f"- Idioma de salida: {opts.language}")
    if opts.focus:
        parts.append(f"- Enfoque especial: {opts.focus}")
    parts.append("REGLA: Adapta vocabulario, profundidad y registro según estas opciones.")
    parts.append("</opciones_de_salida>")
    return "\n".join(parts)


def _build_product_context_xml(product_context: dict | None) -> str:
    """XML block from product-specific context (verbatim from agent.py L1483)."""
    if not product_context:
        return ""
    lines = [f"  <{k}>{v}</{k}>" for k, v in product_context.items() if v]
    if not lines:
        return ""
    return "\n\n<contexto_producto>\n" + "\n".join(lines) + "\n</contexto_producto>"


async def _summarize_report_for_output(report: str, objective: str) -> str:
    """Compress reports >6000 chars using the fast model so the prompt fits.

    Ported from agent.py L1358 — preserves cifras/citations/conclusiones.
    Reports under 6000 chars are returned as-is.
    """
    if len(report) < 6000:
        return report

    try:
        resp = await complete(
            system_prompt="Eres un asistente de síntesis. Responde SOLO con el resumen, sin preámbulos.",
            user_prompt=(
                f"""Resume este informe de investigación en máximo 4000 caracteres.

REGLAS CRÍTICAS:
- Preserva TODAS las cifras, porcentajes y datos numéricos exactos
- Preserva TODAS las citas [N] con sus números originales
- Incluye hallazgos clave de CADA sección (no solo las primeras)
- Incluye las conclusiones y recomendaciones completas
- Preserva nombres de actores, países, organizaciones
- NO inventes datos que no están en el informe
- Escribe en el mismo idioma del informe

<objetivo>
{objective}
</objetivo>

<informe_completo>
{report}
</informe_completo>"""
            ),
            task="classify",   # routes to model_fast (deepseek) — cheap summarization
            max_tokens=3000,
            temperature=0.3,
        )
        return resp.text or report[:10000]
    except Exception as e:
        logger.warning("Report summarization failed, falling back to truncation: %s", e)
        return report[:10000]


def _build_prompt(req: PresentationRequest, palette: dict[str, str], report_summary: str) -> str:
    """Assemble the final user prompt — verbatim shape from agent.py L7557-7622."""
    slide_count = max(5, min(req.slide_count, 20))
    focus_ctx = (
        f"\n\n<enfoque_solicitado>\n{req.focus}\n</enfoque_solicitado>"
        if req.focus else ""
    )
    product_ctx = _build_product_context_xml(req.product_context)
    opts_ctx = _build_output_options_context(req.output_options)

    return f"""Eres un experto en comunicación ejecutiva. Convierte el siguiente informe de investigación en una presentación de {slide_count} diapositivas clara e impactante.

<objetivo>
{req.objective}
</objetivo>{focus_ctx}{product_ctx}{opts_ctx}

PALETA DE COLORES PARA SLIDES — usa estos colores en accent_color y en el diseño:
- Color primario (accent_color por defecto): {palette['accent1']}
- Color secundario: {palette['accent2']}
- Fondo: {palette['bg']}
- Texto: {palette['text']}
- Gradiente para portada: de {palette.get('gradient_start', palette['accent1'])} a {palette.get('gradient_end', palette['bg'])}

<informe>
{report_summary}
</informe>

Genera exactamente {slide_count} slides. Devuelve ÚNICAMENTE JSON válido (sin markdown):

{{
  "slides": [
    {{
      "index": 1,
      "title": "Título de la diapositiva",
      "layout": "title",
      "content": ["Subtítulo o descripción breve"],
      "notes": "Lo que el presentador diría aquí",
      "highlight": "Dato o cifra clave si aplica",
      "image_query": "professional business presentation cover",
      "accent_color": "#3b82f6"
    }}
  ]
}}

Layouts disponibles (VARÍA entre ellos — piensa como un consultor de McKinsey o BCG):
- "title": Portada (solo slide 1). Usa accent_color llamativo. El highlight = tagline o cifra impactante.
- "key_insight": DATO CLAVE — highlight es un NÚMERO GRANDE (ej: "73%", "$2.1B", "4x"). content = [explicación corta, contexto].
- "bullets": Lista de puntos (máx 5 bullets de ≤ 12 palabras). SIEMPRE incluir al menos 1 dato numérico.
- "data": Datos y estadísticas (highlight = cifra principal GRANDE, content = explicaciones con números).
- "quote": Cita destacada (content[0] = la cita, content[1] = fuente/autor).
- "comparison": Comparación A vs B (content = [["Opción A", "dato A"], ["Opción B", "dato B"]]). Incluye métricas.
- "image_right": Texto a la izquierda + imagen a la derecha. REQUIERE image_query ESPECÍFICO.
- "image_left": Imagen a la izquierda + texto a la derecha. REQUIERE image_query ESPECÍFICO.
- "full_image": Imagen de fondo con texto overlay. REQUIERE image_query ESPECÍFICO.
- "stats_grid": Grid de 3-4 métricas con NÚMEROS GRANDES. content = [["Métrica", "Valor"], ...]. El más visual.
- "timeline": Línea temporal con FECHAS Y DATOS. content = [["Fecha", "Evento + cifra"], ...]
- "swot_grid": Análisis SWOT 2x2. content = [["Fortalezas", "items..."], ["Debilidades", "items..."], ["Oportunidades", "items..."], ["Amenazas", "items..."]].
- "process_flow": Flujo de proceso con 3-5 pasos. content = [["Paso 1", "Descripción"], ...]
- "before_after": content = [["Antes", "situación anterior"], ["Después", "situación nueva"]]
- "conclusion": Slide final con 3-4 acciones concretas y medibles.

REGLAS DE DISEÑO (OBLIGATORIAS — estilo consultoría profesional):
1. Usa el MISMO IDIOMA que el objetivo.
2. VARÍA los layouts: NO uses "bullets" en más del 20% de slides. Usa al menos 5 layouts DIFERENTES.
3. Slide 1 SIEMPRE es "title". Último slide SIEMPRE es "conclusion".
4. DATOS EN CADA SLIDE: Todo slide DEBE contener al menos 1 número, porcentaje o métrica concreta.
5. Usa al menos 1 "key_insight" con un número grande e impactante como highlight (ej: "73%", "$4.2M", "10x").
6. Usa al menos 2 slides con image_right o image_left. image_query DEBE ser ESPECÍFICO.
7. Usa al menos 1 "stats_grid" con 3-4 métricas numéricas del informe.
8. Usa al menos 1 "quote" o "comparison" para variedad visual.
9. Asigna accent_color POR SECCIÓN TEMÁTICA usando variaciones del acento primario de la paleta.
10. ARCO NARRATIVO: portada → problema/contexto → insight clave → evidencia/datos → implicaciones → acciones.
11. El highlight SIEMPRE debe ser un DATO IMPACTANTE: número, porcentaje, tendencia, no una frase genérica.
12. content: máximo 5 items por slide, cada uno ≤ 15 palabras. Sé conciso y visual.
13. Las notes = lo que el presentador DIRÍA — contexto adicional, no repetir el contenido.
"""


def _post_process(slides: list[Slide]) -> list[Slide]:
    """Apply the same fixes deepresearch's endpoint applies after parsing.

    - Force first slide to layout='title' and last to 'conclusion'
    - For slides with empty highlight in number-heavy layouts, extract first
      number found in content as a fallback highlight.
    """
    if not slides:
        return slides
    if slides[0].layout != "title":
        slides[0].layout = "title"
    if slides[-1].layout != "conclusion":
        slides[-1].layout = "conclusion"

    number_layouts = {"key_insight", "data", "stats_grid"}
    for s in slides:
        if not s.highlight and s.layout in number_layouts:
            for c in s.content:
                nums = re.findall(r"[\d,.]+%?", str(c))
                if nums:
                    s.highlight = nums[0]
                    break
    return slides


def _extract_json(raw: str) -> dict:
    """Robust JSON extraction with fallbacks for stray prose around the block."""
    cleaned = clean_json_response(raw)
    if isinstance(cleaned, dict):
        return cleaned
    # Last-ditch: locate { ... } around "slides"
    start = raw.find('{"slides"')
    if start == -1:
        start = raw.find('{\n')
    if start >= 0:
        end = raw.rfind("}") + 1
        if end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
    return {"slides": []}


# ─── Main entry points ────────────────────────────────────────────────────────


async def generate_presentation_oneshot(req: PresentationRequest) -> tuple[list[dict], dict[str, str]]:
    """Non-streaming variant — fully waits, returns (slides, palette).

    Used by routes that just want JSON. For SSE streaming see
    generate_presentation_stream below.
    """
    palette = _resolve_palette(req.output_options.model_dump())
    report_summary = await _summarize_report_for_output(req.report, req.objective)
    prompt = _build_prompt(req, palette, report_summary)

    resp = await complete(
        system_prompt="",
        user_prompt=prompt,
        task="synthesize",         # routes to model_powerful (gemini-3.1-pro)
        max_tokens=8000,
        temperature=0.7,
    )

    data = _extract_json(resp.text)
    slides = [Slide.from_dict(s) for s in data.get("slides", [])]
    slides = _post_process(slides)

    # Lazy import to avoid circular deps if image_provider grows
    if req.image_provider != "none":
        from .image_provider import fetch_images_for_slides
        slides_dicts = [s.to_dict() for s in slides]
        await fetch_images_for_slides(slides_dicts, provider=req.image_provider)
        # Re-hydrate image_url back into Slide objects
        for s, sd in zip(slides, slides_dicts):
            s.image_url = sd.get("image_url", "")

    return [s.to_dict() for s in slides], palette


async def generate_presentation_stream(req: PresentationRequest) -> AsyncIterator[dict]:
    """Streaming variant — yields SSE-friendly events.

    Events:
      {"type":"thinking","text":"..."}  (only if model emits reasoning — currently ignored)
      {"type":"text","text":"..."}       Raw JSON tokens as they arrive
      {"type":"slides", slides:[...], palette:{...}, presentation_prompt:"..."}
      {"type":"done"}
      {"type":"error","text":"..."}
    """
    try:
        palette = _resolve_palette(req.output_options.model_dump())
        yield {"type": "status", "stage": "summarizing"}
        report_summary = await _summarize_report_for_output(req.report, req.objective)
        prompt = _build_prompt(req, palette, report_summary)

        yield {"type": "status", "stage": "generating", "palette": palette}

        # Stream raw text as it arrives
        raw = ""
        async for token in stream_response(
            system_prompt="",
            history=[{"role": "user", "content": prompt}],
            task="synthesize",
            max_tokens_override=8000,
        ):
            raw += token
            # We don't forward every token to the client to keep the wire light;
            # we send periodic progress events instead.
            if len(raw) % 1500 == 0:
                yield {"type": "progress", "chars": len(raw)}

        yield {"type": "status", "stage": "parsing"}

        data = _extract_json(raw)
        slides = [Slide.from_dict(s) for s in data.get("slides", [])]
        slides = _post_process(slides)

        if req.image_provider != "none":
            yield {"type": "status", "stage": "fetching_images"}
            from .image_provider import fetch_images_for_slides
            slides_dicts = [s.to_dict() for s in slides]
            await fetch_images_for_slides(slides_dicts, provider=req.image_provider)
            for s, sd in zip(slides, slides_dicts):
                s.image_url = sd.get("image_url", "")

        # Build a markdown design brief mirroring deepresearch's _build_presentation_prompt
        presentation_prompt_md = _build_design_brief(req.objective, slides, palette)

        yield {
            "type": "slides",
            "slides": [s.to_dict() for s in slides],
            "total_slides": len(slides),
            "palette": palette,
            "presentation_prompt": presentation_prompt_md,
        }
        yield {"type": "done"}

    except Exception as e:
        logger.exception("generate_presentation_stream failed: %s", e)
        yield {"type": "error", "text": str(e)}


_LAYOUT_DESCRIPTIONS = {
    "title": "Portada con gradiente de color de acento",
    "key_insight": "Dato clave grande centrado con contexto",
    "bullets": "Lista de puntos con datos numéricos",
    "data": "Estadísticas y datos con métrica principal destacada",
    "quote": "Cita destacada centrada",
    "comparison": "Comparación lado a lado (A vs B)",
    "image_right": "Texto a la izquierda + imagen a la derecha",
    "image_left": "Imagen a la izquierda + texto a la derecha",
    "full_image": "Imagen de fondo con texto superpuesto",
    "stats_grid": "Grid de 3-4 métricas numéricas grandes",
    "timeline": "Línea temporal horizontal con eventos",
    "swot_grid": "Análisis SWOT 2x2",
    "process_flow": "Flujo de proceso con 3-5 pasos secuenciales",
    "before_after": "Comparación Antes vs Después",
    "conclusion": "Slide final con recomendaciones y acciones",
}


def _build_design_brief(objective: str, slides: list[Slide], palette: dict[str, str]) -> str:
    """Exportable markdown brief describing the deck — handoff to designers."""
    lines = [
        f"# Presentación: {objective}",
        "",
        "## Guía de Diseño Visual",
        f"- **Fondo:** {palette['bg']}",
        f"- **Acento primario:** {palette['accent1']}",
        f"- **Acento secundario:** {palette['accent2']}",
        f"- **Texto:** {palette['text']}",
        f"- **Total slides:** {len(slides)}",
        "- **Arco narrativo:** Portada → Contexto → Insight Clave → Evidencia → Implicaciones → Acciones",
        "",
        "---",
        "",
        "## Contenido por Slide",
        "",
    ]
    for i, s in enumerate(slides):
        layout_desc = _LAYOUT_DESCRIPTIONS.get(s.layout, s.layout)
        lines.append(f"### Slide {i + 1}: {s.title}")
        lines.append(f"**Layout:** {s.layout} — {layout_desc}")
        if s.highlight:
            lines.append(f"**Dato destacado:** {s.highlight}")
        if s.content:
            lines.append("**Contenido:**")
            for c in s.content:
                if isinstance(c, list):
                    lines.append(f"  - {' | '.join(str(x) for x in c)}")
                else:
                    lines.append(f"  - {c}")
        if s.image_query:
            lines.append(f"**Imagen sugerida:** {s.image_query}")
        if s.image_url:
            lines.append(f"**URL imagen:** {s.image_url}")
        if s.accent_color:
            lines.append(f"**Color de acento:** {s.accent_color}")
        if s.notes:
            lines.append(f"**Notas del presentador:** {s.notes}")
        lines.append("")
        lines.append("---")
        lines.append("")
    return "\n".join(lines)
