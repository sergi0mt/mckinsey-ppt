"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Sparkles, BarChart3, Search, Loader2, Save, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  Slide,
  SharpenChart,
  SharpenCitation,
  SharpenResponse,
  SharpenTarget,
} from "@/lib/types";
import { Chip, Logo } from "@/lib/v2/primitives";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

type Bullet = { text: string; bold_prefix?: string };
type ChartSpec = {
  chart_type?: string;
  categories?: (string | number)[];
  series?: { name?: string; values?: number[] }[];
  source?: string;
  so_what?: string;
};

type SlideContentJson = {
  bullets?: (Bullet | string)[];
  chart?: ChartSpec;
  so_what?: string;
  source?: string;
  section_number?: string;
  section_name?: string;
};

const CHART_TYPES = [
  "bar_vertical",
  "line",
  "waterfall",
  "stacked_bar",
  "matrix_2x2",
  "harvey_balls",
];

// ────────────────────────────────────────────────────────────────
// Slide editor page
// ────────────────────────────────────────────────────────────────

export default function SlideEditorPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const slideId = params.slideId as string;

  const [allSlides, setAllSlides] = useState<Slide[]>([]);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [actionTitle, setActionTitle] = useState("");
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [chartType, setChartType] = useState<string>("");
  const [chartSoWhat, setChartSoWhat] = useState("");
  const [chartSource, setChartSource] = useState("");

  // AI sharpen state
  const [sharpenLoading, setSharpenLoading] = useState<SharpenTarget | null>(null);
  const [sharpenPreview, setSharpenPreview] = useState<SharpenResponse | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.slides
      .list(projectId)
      .then((slides) => {
        setAllSlides(slides);
        const found = slides.find((s) => s.id === slideId) ?? slides[0];
        if (found) loadSlideIntoState(found);
      })
      .catch((err) => toast.error("Failed to load slide: " + err.message))
      .finally(() => setLoading(false));
  }, [projectId, slideId]);

  function loadSlideIntoState(s: Slide) {
    setSlide(s);
    setActionTitle(s.action_title);
    const c = s.content_json as SlideContentJson;
    setBullets(
      Array.isArray(c?.bullets)
        ? c.bullets.map((b) => (typeof b === "string" ? { text: b } : (b as Bullet)))
        : [],
    );
    setChartType(c?.chart?.chart_type ?? "");
    setChartSoWhat(c?.chart?.so_what ?? c?.so_what ?? "");
    setChartSource(c?.chart?.source ?? c?.source ?? "");
  }

  const slideIdx = useMemo(
    () => allSlides.findIndex((s) => s.id === slide?.id),
    [allSlides, slide],
  );

  function navigateTo(delta: number) {
    const target = allSlides[slideIdx + delta];
    if (target) router.push(`/v2/engagements/${projectId}/slides/${target.id}`);
  }

  /**
   * Request a sharpen preview from the backend. Does NOT mutate state — opens
   * the preview dialog so the user can review {before, after, rationale} and
   * decide to apply or discard.
   */
  async function requestSharpen(
    target: SharpenTarget,
    options?: Record<string, unknown>,
  ) {
    if (!slide) return;
    setSharpenLoading(target);
    try {
      const res = await api.sharpen.request(projectId, {
        target,
        slide_id: slide.id,
        options,
      });
      setSharpenPreview(res);
    } catch (err) {
      toast.error("Sharpen failed: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setSharpenLoading(null);
    }
  }

  /**
   * Apply the in-flight preview to local state. The user still has to hit
   * Save to persist — keeps a clear undo path (just reload the slide).
   */
  function applySharpen() {
    if (!sharpenPreview || !slide) return;
    const { target, after } = sharpenPreview;

    if (target === "action_title" && typeof after === "string") {
      setActionTitle(after);
      toast.success("Title updated · review and save");
    } else if (target === "chart" && after && typeof after === "object") {
      const c = after as SharpenChart;
      setChartType(c.chart_type);
      setChartSoWhat(c.so_what);
      setChartSource(c.source);
      // Patch slide.content_json so the preview shows the new chart spec
      const next: Slide = {
        ...slide,
        content_json: {
          ...(slide.content_json as Record<string, unknown>),
          chart: { ...c },
        },
      };
      setSlide(next);
      toast.success("Chart updated · review and save");
    } else if (target === "citation" && after && typeof after === "object") {
      const cit = after as SharpenCitation;
      // Citation shows in the SOURCE footer — store the title (+host) as the
      // attribution string. Full URL/snippet preserved on the slide content
      // so the export can hyperlink it.
      const host = (() => {
        try {
          return new URL(cit.url).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })();
      const attribution = cit.title + (host ? ` · ${host}` : "");
      setChartSource(attribution);
      const cj = slide.content_json as Record<string, unknown>;
      const existingCitations =
        Array.isArray((cj as { citations?: SharpenCitation[] }).citations)
          ? (cj as { citations: SharpenCitation[] }).citations
          : [];
      const next: Slide = {
        ...slide,
        content_json: {
          ...cj,
          source: attribution,
          citations: [...existingCitations, cit],
        },
      };
      setSlide(next);
      toast.success("Citation added · review and save");
    } else if (target === "slide_full" && after && typeof after === "object") {
      const full = after as { action_title?: string; content_json?: Record<string, unknown> };
      if (full.action_title) setActionTitle(full.action_title);
      if (full.content_json) {
        const newCj = full.content_json;
        const newBullets =
          Array.isArray((newCj as { bullets?: unknown[] }).bullets)
            ? ((newCj as { bullets?: (Bullet | string)[] }).bullets ?? []).map((b) =>
                typeof b === "string" ? { text: b } : (b as Bullet),
              )
            : bullets;
        setBullets(newBullets);
        const nc = (newCj as { chart?: ChartSpec }).chart;
        if (nc) {
          setChartType(nc.chart_type ?? "");
          setChartSoWhat(nc.so_what ?? "");
          setChartSource(nc.source ?? "");
        }
        setSlide({ ...slide, content_json: newCj });
      }
      toast.success("Slide refreshed · review and save");
    }

    setSharpenPreview(null);
  }

  async function handleSave() {
    if (!slide) return;
    setSaving(true);
    try {
      const newContent: SlideContentJson = {
        ...(slide.content_json as SlideContentJson),
        bullets,
      };
      if (newContent.chart) {
        newContent.chart = {
          ...newContent.chart,
          chart_type: chartType || newContent.chart.chart_type,
          so_what: chartSoWhat,
          source: chartSource,
        };
      }
      await api.slides.update(slide.id, {
        action_title: actionTitle,
        content_json: newContent as Record<string, unknown>,
      });
      toast.success("Slide saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ color: "var(--ink-3)" }}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span style={{ fontSize: 13 }}>Loading slide…</span>
      </div>
    );
  }

  if (!slide) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ color: "var(--ink-3)" }}>
        <span style={{ fontSize: 13 }}>Slide not found.</span>
      </div>
    );
  }

  const c = slide.content_json as SlideContentJson;
  const titleWords = actionTitle.trim().split(/\s+/).filter(Boolean).length;
  const hasNumber = /\d/.test(actionTitle);
  const hasVerb = /\b(grew|grows|drives|drove|reduces|reduced|enables|requires|captures|outperforms|delivers|forecasts|expands|shrinks|doubles|triples|will|reaches|crosses)\b/i.test(actionTitle);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{ padding: "12px 24px", borderColor: "var(--line)", background: "var(--paper)" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/v2/engagements/${projectId}`)} className="v2-ghost-btn">
            <ArrowLeft className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Workspace
          </button>
          <Logo size={14} />
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>
            SLIDE {String(slide.position + 1).padStart(2, "0")} · {slide.slide_type.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigateTo(-1)} disabled={slideIdx <= 0} className="v2-ghost-btn">
            <ChevronLeft className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Prev
          </button>
          <button onClick={() => navigateTo(1)} disabled={slideIdx >= allSlides.length - 1} className="v2-ghost-btn">
            Next
            <ChevronRight className="h-[13px] w-[13px]" strokeWidth={1.5} />
          </button>
          <button onClick={handleSave} disabled={saving} className="v2-default-btn">
            {saving ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Save className="h-[13px] w-[13px]" strokeWidth={1.5} />}
            Save
          </button>
        </div>
      </header>

      {/* ── 2-column body: preview + inspector ──────────── */}
      <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: "1fr 360px", minHeight: 0 }}>
        {/* ── Preview ──────────────────────────────────── */}
        <div
          className="flex items-center justify-center overflow-auto"
          style={{ padding: 40, background: "var(--bg)" }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 920,
              aspectRatio: "16/9",
              background: "white",
              borderRadius: 4,
              boxShadow: "0 20px 60px -20px rgba(0,0,0,0.15), 0 0 0 1px var(--line-2)",
              padding: "36px 44px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/**
             * Title block: wrapped in a flex-1 container for title/divider slides so the heading centers vertically
             * in the available space (above the footer). For content slides, no wrapper — title sits at top as usual.
             */}
            {slide.slide_type === "title" || slide.slide_type === "divider" ? (
              <div className="flex flex-1 flex-col items-start justify-center">
                {(c?.section_number || c?.section_name) && (
                  <div
                    className="mb-2 uppercase"
                    style={{ fontSize: 10, letterSpacing: 2, color: "var(--ink-3)" }}
                  >
                    {c.section_number ?? ""} · {c.section_name ?? ""}
                  </div>
                )}
                <h2
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 36,
                    letterSpacing: -0.6,
                    lineHeight: 1.15,
                    margin: 0,
                    fontWeight: 500,
                    color: "#002960",
                  }}
                >
                  {actionTitle}
                </h2>
              </div>
            ) : (
              <>
                {(c?.section_number || c?.section_name) && (
                  <div
                    className="mb-1.5 uppercase"
                    style={{ fontSize: 10, letterSpacing: 2, color: "var(--ink-3)" }}
                  >
                    {c.section_number ?? ""} · {c.section_name ?? ""}
                  </div>
                )}
                <h2
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 28,
                    letterSpacing: -0.4,
                    lineHeight: 1.2,
                    margin: "0 0 12px",
                    fontWeight: 500,
                    color: "#002960",
                  }}
                >
                  {actionTitle}
                </h2>
              </>
            )}
            {/* Body (bullets/chart) only renders when there is content — title/divider slides are just the big serif h2, centered by the outer flex */}
            {(bullets.length > 0 || c?.chart) && (
              <div className="mt-2 flex flex-1 flex-col">
                {bullets.length > 0 && (
                  <ul className="m-0 flex flex-col gap-2.5 p-0" style={{ listStyle: "none" }}>
                    {bullets.map((b, i) => (
                      <li
                        key={i}
                        className="flex gap-2"
                        style={{ fontSize: 14, color: "#1A1A1A", lineHeight: 1.45 }}
                      >
                        <span style={{ color: "#0065BD" }}>—</span>
                        <span>
                          {b.bold_prefix && (
                            <strong style={{ color: "#002960" }}>{b.bold_prefix} </strong>
                          )}
                          {b.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {c?.chart && (
                  <div className="mt-3 flex-1">
                    <MockChart chart={c.chart} />
                  </div>
                )}
              </div>
            )}
            {/* Footer — always show, pushed to bottom with mt-auto */}
            <div
              className="mt-auto flex justify-between border-t pt-2.5"
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--ink-3)",
                borderColor: "var(--line)",
              }}
            >
              <span>SOURCE: {chartSource || c?.source || "—"}</span>
              <span>SO WHAT: {chartSoWhat || c?.so_what || "—"}</span>
            </div>
          </div>
        </div>

        {/* ── Inspector ────────────────────────────────── */}
        <div
          className="overflow-auto border-l"
          style={{ borderColor: "var(--line)", background: "var(--paper)" }}
        >
          {/* Action title */}
          <div className="border-b" style={{ padding: "18px 20px", borderColor: "var(--line)" }}>
            <div className="v2-kicker mb-1.5" style={{ fontSize: 10, letterSpacing: 1.5 }}>
              Action title
            </div>
            <textarea
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              className="w-full"
              style={{
                fontFamily: "var(--serif)",
                fontSize: 15,
                lineHeight: 1.3,
                resize: "vertical",
                minHeight: 64,
              }}
            />
            <div
              className="mt-1.5 flex gap-2.5"
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--ink-3)",
              }}
            >
              <span>{titleWords} words</span>
              <span style={{ color: hasNumber ? "var(--success)" : "var(--ink-3)" }}>
                contains number · {hasNumber ? "✓" : "·"}
              </span>
              <span style={{ color: hasVerb ? "var(--success)" : "var(--ink-3)" }}>
                has verb · {hasVerb ? "✓" : "·"}
              </span>
            </div>
          </div>

          {/* Bullets editor */}
          {bullets.length > 0 && (
            <div className="border-b" style={{ padding: "18px 20px", borderColor: "var(--line)" }}>
              <div className="v2-kicker mb-2.5" style={{ fontSize: 10, letterSpacing: 1.5 }}>
                Bullets
              </div>
              <div className="flex flex-col gap-2">
                {bullets.map((b, i) => (
                  <div
                    key={i}
                    style={{ border: "1px solid var(--line)", borderRadius: 4, padding: "8px 10px", background: "var(--bg)" }}
                  >
                    {b.bold_prefix && (
                      <input
                        value={b.bold_prefix}
                        onChange={(e) => {
                          const next = [...bullets];
                          next[i] = { ...next[i], bold_prefix: e.target.value };
                          setBullets(next);
                        }}
                        className="mb-1 w-full"
                        placeholder="Bold prefix (optional)"
                        style={{ fontWeight: 600, fontSize: 12 }}
                      />
                    )}
                    <input
                      value={b.text}
                      onChange={(e) => {
                        const next = [...bullets];
                        next[i] = { ...next[i], text: e.target.value };
                        setBullets(next);
                      }}
                      className="w-full"
                      style={{ fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chart editor */}
          {c?.chart && (
            <div className="border-b" style={{ padding: "18px 20px", borderColor: "var(--line)" }}>
              <div className="v2-kicker mb-2.5" style={{ fontSize: 10, letterSpacing: 1.5 }}>
                Chart
              </div>
              <div className="mb-2.5 grid grid-cols-2 gap-1.5">
                {CHART_TYPES.map((t) => {
                  const selected = chartType === t || (chartType === "" && c?.chart?.chart_type === t);
                  return (
                    <button
                      key={t}
                      onClick={() => setChartType(t)}
                      style={{
                        padding: "8px 10px",
                        fontSize: 11,
                        border: "1px solid " + (selected ? "var(--ink)" : "var(--line)"),
                        borderRadius: 4,
                        textAlign: "center",
                        fontFamily: "var(--mono)",
                        background: selected ? "var(--bg)" : "transparent",
                        cursor: "pointer",
                        color: "var(--ink)",
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="v2-kicker mb-1.5 mt-3.5" style={{ fontSize: 10, letterSpacing: 1.5 }}>
                So-what
              </div>
              <input
                value={chartSoWhat}
                onChange={(e) => setChartSoWhat(e.target.value)}
                className="w-full"
                placeholder="Why this chart matters for the decision"
                style={{ fontSize: 12 }}
              />
              <div className="v2-kicker mb-1.5 mt-3" style={{ fontSize: 10, letterSpacing: 1.5 }}>
                Source
              </div>
              <input
                value={chartSource}
                onChange={(e) => setChartSource(e.target.value)}
                className="w-full"
                placeholder="e.g., McKinsey Global Institute, 2025"
                style={{ fontSize: 12 }}
              />
            </div>
          )}

          {/* AI suggestions */}
          <div style={{ padding: "18px 20px" }}>
            <div className="v2-kicker mb-2" style={{ fontSize: 10, letterSpacing: 1.5 }}>
              AI suggestions
            </div>
            <div className="flex flex-col gap-1.5">
              <SugButton
                icon={
                  sharpenLoading === "action_title" ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                  ) : (
                    <Sparkles className="h-3 w-3" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                  )
                }
                label={titleWords > 9 ? `Tighten title to 9 words (now ${titleWords})` : "Tighten title to 9 words"}
                disabled={sharpenLoading !== null}
                onClick={() => requestSharpen("action_title", { target_words: 9 })}
              />
              <SugButton
                icon={
                  sharpenLoading === "chart" ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                  ) : (
                    <BarChart3 className="h-3 w-3" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                  )
                }
                label={c?.chart ? "Suggest a better chart_type" : "Add a chart"}
                disabled={sharpenLoading !== null}
                onClick={() =>
                  requestSharpen("chart", c?.chart ? {} : { requested_chart_type: "bar_vertical" })
                }
              />
              <SugButton
                icon={
                  sharpenLoading === "citation" ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                  ) : (
                    <Search className="h-3 w-3" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                  )
                }
                label="Cite 1 more Tier-1 source"
                disabled={sharpenLoading !== null}
                onClick={() => requestSharpen("citation")}
              />
              <SugButton
                icon={
                  sharpenLoading === "slide_full" ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                  ) : (
                    <Sparkles className="h-3 w-3" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                  )
                }
                label="Refresh whole slide"
                disabled={sharpenLoading !== null}
                onClick={() => requestSharpen("slide_full")}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sharpen preview dialog */}
      {sharpenPreview && (
        <SharpenPreviewDialog
          preview={sharpenPreview}
          onApply={applySharpen}
          onDiscard={() => setSharpenPreview(null)}
        />
      )}

      <style jsx>{`
        :global(.v2-theme .v2-ghost-btn) {
          background: transparent;
          color: var(--ink-2);
          border: 1px solid var(--line-2);
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 500;
          font-family: var(--sans);
          cursor: pointer;
          transition: opacity 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        :global(.v2-theme .v2-ghost-btn:hover) { opacity: 0.7; }
        :global(.v2-theme .v2-ghost-btn:disabled) { opacity: 0.4; cursor: not-allowed; }
        :global(.v2-theme .v2-default-btn) {
          background: var(--ink);
          color: var(--paper);
          border: 1px solid var(--ink);
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 500;
          font-family: var(--sans);
          cursor: pointer;
          transition: opacity 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        :global(.v2-theme .v2-default-btn:hover) { opacity: 0.9; }
        :global(.v2-theme .v2-default-btn:disabled) { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SugButton — AI suggestion item
// ────────────────────────────────────────────────────────────────

function SugButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2.5 text-left transition-colors hover:bg-black/[.02] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        padding: "8px 10px",
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12,
        color: "var(--ink-2)",
        fontFamily: "var(--sans)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
// SharpenPreviewDialog — show {before, after, rationale} with apply/discard
// ────────────────────────────────────────────────────────────────

function SharpenPreviewDialog({
  preview,
  onApply,
  onDiscard,
}: {
  preview: SharpenResponse;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const TITLE_BY_TARGET: Record<SharpenTarget, string> = {
    action_title: "Tighten action title",
    chart: "Chart suggestion",
    citation: "Add Tier-1 citation",
    slide_full: "Slide refresh",
    briefing_field: "Briefing field",
  };
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(26, 24, 20, 0.30)" }}
        onClick={onDiscard}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ padding: 24, pointerEvents: "none" }}
      >
        <div
          className="flex flex-col shadow-2xl"
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: 560,
            background: "var(--paper)",
            border: "1px solid var(--line-2)",
            borderRadius: 10,
            maxHeight: "85vh",
          }}
        >
          <div
            className="flex shrink-0 items-center gap-2.5 border-b"
            style={{ padding: "14px 20px", borderColor: "var(--line)" }}
          >
            <Sparkles
              className="h-[14px] w-[14px]"
              strokeWidth={1.5}
              style={{ color: "var(--accent)" }}
            />
            <span className="v2-kicker" style={{ fontSize: 11, letterSpacing: 1 }}>
              {TITLE_BY_TARGET[preview.target] ?? "AI suggestion"}
            </span>
            <div className="flex-1" />
            <button
              onClick={onDiscard}
              className="cursor-pointer transition-opacity hover:opacity-70"
              style={{ background: "transparent", border: "none", padding: 4 }}
              aria-label="Discard suggestion"
            >
              <X className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
            </button>
          </div>

          <div
            className="overflow-y-auto"
            style={{ padding: "16px 20px", minHeight: 0 }}
          >
            <div className="v2-kicker mb-1.5" style={{ fontSize: 10, letterSpacing: 1.4 }}>
              Before
            </div>
            <div
              className="mb-3.5"
              style={{
                padding: "10px 12px",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--ink-3)",
                lineHeight: 1.5,
                fontFamily: "var(--sans)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {renderPreviewValue(preview.before)}
            </div>

            <div className="v2-kicker mb-1.5" style={{ fontSize: 10, letterSpacing: 1.4 }}>
              After
            </div>
            <div
              className="mb-3.5"
              style={{
                padding: "10px 12px",
                background: "color-mix(in oklch, var(--accent) 6%, var(--paper))",
                border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--ink)",
                lineHeight: 1.5,
                fontFamily: "var(--sans)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {renderPreviewValue(preview.after)}
            </div>

            {preview.rationale && (
              <>
                <div className="v2-kicker mb-1.5" style={{ fontSize: 10, letterSpacing: 1.4 }}>
                  Why
                </div>
                <p
                  className="m-0 italic"
                  style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}
                >
                  {preview.rationale}
                </p>
              </>
            )}
          </div>

          <div
            className="flex shrink-0 justify-end gap-1.5 border-t"
            style={{ padding: "12px 20px", borderColor: "var(--line)" }}
          >
            <button onClick={onDiscard} className="v2-ghost-btn">
              Discard
            </button>
            <button onClick={onApply} className="v2-default-btn">
              <Check className="h-[13px] w-[13px]" strokeWidth={2} />
              Apply (review then save)
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function renderPreviewValue(v: unknown): string {
  if (v == null || v === "") return "(empty)";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  // For chart / citation / slide_full objects, render the most relevant
  // human-readable summary; full JSON is too noisy for a preview pane.
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.title === "string" && typeof o.url === "string") {
      // Citation
      const t = o.quality_tier ? `[Tier ${o.quality_tier}] ` : "";
      const snip = o.snippet ? `\n\n"${o.snippet}"` : "";
      return `${t}${o.title}\n${o.url}${snip}`;
    }
    if (typeof o.chart_type === "string") {
      // Chart
      const cats = Array.isArray(o.categories) ? o.categories.join(" · ") : "";
      const series = Array.isArray(o.series)
        ? (o.series as { name?: string; values?: number[] }[])
            .map((s) => `${s.name ?? "values"}: [${(s.values ?? []).join(", ")}]`)
            .join("\n")
        : "";
      const sw = o.so_what ? `\nso-what: ${o.so_what}` : "";
      const src = o.source ? `\nsource: ${o.source}` : "";
      return `chart_type: ${o.chart_type}\ncategories: ${cats}\n${series}${sw}${src}`;
    }
    if (typeof o.action_title === "string") {
      // slide_full before/after
      const cj = (o.content_json ?? {}) as Record<string, unknown>;
      const bullets = Array.isArray(cj.bullets)
        ? (cj.bullets as (Bullet | string)[])
            .map((b) => "  — " + (typeof b === "string" ? b : (b.bold_prefix ? b.bold_prefix + " " : "") + b.text))
            .join("\n")
        : "";
      return `${o.action_title}\n\n${bullets}`;
    }
    return JSON.stringify(v, null, 2);
  }
  return String(v);
}

// ────────────────────────────────────────────────────────────────
// Chart preview — renders the slide's actual chart data when present.
// bar_vertical / bar_horizontal / line render real; other chart types
// (waterfall, stacked_bar, matrix_2x2, harvey_balls) show a typed placeholder.
// ────────────────────────────────────────────────────────────────

function MockChart({ chart }: { chart: ChartSpec }) {
  const rawSeries = chart.series?.[0]?.values;
  const rawCategories = chart.categories;
  const hasRealData =
    Array.isArray(rawSeries) &&
    rawSeries.length > 0 &&
    Array.isArray(rawCategories) &&
    rawCategories.length > 0;
  const type = (chart.chart_type ?? "bar_vertical").toLowerCase();
  const supported = type === "bar_vertical" || type === "bar_horizontal" || type === "line";

  if (!hasRealData || !supported) {
    return <ChartPlaceholder type={type} hasData={hasRealData} />;
  }

  const series = rawSeries as number[];
  const labels = (rawCategories as (string | number)[]).map(String);
  const max = Math.max(...series.filter((v) => Number.isFinite(v)), 1);

  if (type === "bar_horizontal") {
    return <BarHorizontalChart series={series} labels={labels} max={max} />;
  }
  if (type === "line") {
    return <LineChart series={series} labels={labels} max={max} />;
  }
  return <BarVerticalChart series={series} labels={labels} max={max} />;
}

function BarVerticalChart({
  series,
  labels,
  max,
}: {
  series: number[];
  labels: string[];
  max: number;
}) {
  const w = 100 / series.length;
  const height = 180;
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      {series.map((v, i) => {
        const h = (v / max) * (height - 24);
        return (
          <g key={i}>
            <rect
              x={i * w + 1.5}
              y={height - 16 - h}
              width={w - 3}
              height={h}
              fill="#0065BD"
              opacity={i === series.length - 1 ? 1 : 0.75}
            />
            <text
              x={i * w + w / 2}
              y={height - 4}
              fontSize={5}
              textAnchor="middle"
              fill="#6B6B6B"
              fontFamily="var(--mono)"
            >
              {labels[i] ?? ""}
            </text>
            <text
              x={i * w + w / 2}
              y={height - 20 - h}
              fontSize={5.5}
              textAnchor="middle"
              fill="#3D3D3D"
              fontFamily="var(--mono)"
            >
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function BarHorizontalChart({
  series,
  labels,
  max,
}: {
  series: number[];
  labels: string[];
  max: number;
}) {
  const height = 180;
  const rowH = (height - 8) / series.length;
  // Reserve left axis label area
  const labelW = 22;
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      {series.map((v, i) => {
        const barW = (v / max) * (100 - labelW - 8);
        const y = i * rowH + 4;
        return (
          <g key={i}>
            <text
              x={labelW - 2}
              y={y + rowH * 0.6}
              fontSize={5}
              textAnchor="end"
              fill="#6B6B6B"
              fontFamily="var(--mono)"
            >
              {labels[i] ?? ""}
            </text>
            <rect
              x={labelW}
              y={y + 1}
              width={barW}
              height={rowH - 4}
              fill="#0065BD"
              opacity={i === series.length - 1 ? 1 : 0.75}
            />
            <text
              x={labelW + barW + 2}
              y={y + rowH * 0.6}
              fontSize={5}
              fill="#3D3D3D"
              fontFamily="var(--mono)"
            >
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({
  series,
  labels,
  max,
}: {
  series: number[];
  labels: string[];
  max: number;
}) {
  const height = 180;
  const innerH = height - 24;
  const stepX = series.length > 1 ? 96 / (series.length - 1) : 0;
  const startX = 2;
  const points = series.map((v, i) => {
    const x = startX + i * stepX;
    const y = innerH - (v / max) * (innerH - 8) + 4;
    return { x, y, v };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      <path d={path} fill="none" stroke="#0065BD" strokeWidth={1.2} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={1.2} fill="#0065BD" />
          <text
            x={p.x}
            y={height - 4}
            fontSize={5}
            textAnchor="middle"
            fill="#6B6B6B"
            fontFamily="var(--mono)"
          >
            {labels[i] ?? ""}
          </text>
          <text
            x={p.x}
            y={p.y - 3}
            fontSize={5.5}
            textAnchor="middle"
            fill="#3D3D3D"
            fontFamily="var(--mono)"
          >
            {p.v}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ChartPlaceholder({ type, hasData }: { type: string; hasData: boolean }) {
  const PLACEHOLDER_LABELS: Record<string, string> = {
    waterfall: "Waterfall preview",
    stacked_bar: "Stacked bar preview",
    matrix_2x2: "2×2 matrix preview",
    harvey_balls: "Harvey balls preview",
  };
  const label = PLACEHOLDER_LABELS[type] ?? `${type} preview`;
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        height: 180,
        border: "1px dashed var(--line-2)",
        borderRadius: 6,
        background: "var(--bg)",
        color: "var(--ink-3)",
        fontSize: 12,
        gap: 4,
      }}
    >
      <span style={{ fontFamily: "var(--mono)", letterSpacing: 1, fontSize: 10 }}>
        {label.toUpperCase()}
      </span>
      <span style={{ fontSize: 11 }}>
        {hasData
          ? "Rendered as real chart in the exported deck"
          : "Awaiting categories + series data"}
      </span>
    </div>
  );
}
