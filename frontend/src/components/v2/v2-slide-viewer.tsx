/**
 * V2SlideViewer — renders DeepResearch-style slides as HTML.
 *
 * Mirrors the layout grammar from sergi0mt/deepresearch's /presentation
 * endpoint. Slides are 1920x1080 logical; the parent scales via transform
 * to fit the available container. Palette comes from theme_palettes.py
 * server-side; we just read accent1/accent2/bg/text/etc.
 *
 * Public surface:
 *   <V2SlideViewer slides={...} palette={...} onSlideChange={...} />
 *
 * Layouts implemented (15):
 *   title, key_insight, bullets, data, quote, comparison, image_right,
 *   image_left, full_image, stats_grid, timeline, swot_grid, process_flow,
 *   before_after, conclusion + generic fallback.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DeepResearchSlide, PresentationPalette } from "@/lib/types";

const W = 1920;
const H = 1080;

export function V2SlideViewer({
  slides,
  palette,
  onSlideChange,
}: {
  slides: DeepResearchSlide[];
  palette: PresentationPalette;
  onSlideChange?: (idx: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // Compute scale so the 1920x1080 stage fits the parent container width
  useEffect(() => {
    function recompute() {
      const el = stageRef.current?.parentElement;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      // Pick the smaller scale so neither dimension overflows.
      // Reserve some breathing room (95%) so the slide doesn't touch edges.
      const s = Math.min(w / W, h / H) * 0.95;
      setScale(Math.max(0.1, s));
    }
    recompute();
    const obs = new ResizeObserver(recompute);
    if (stageRef.current?.parentElement) obs.observe(stageRef.current.parentElement);
    return () => obs.disconnect();
  }, []);

  const go = useCallback((nextIdx: number) => {
    if (slides.length === 0) return;
    const clamped = ((nextIdx % slides.length) + slides.length) % slides.length;
    setIdx(clamped);
    onSlideChange?.(clamped);
  }, [slides.length, onSlideChange]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(idx + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, go]);

  const current = slides[idx];

  if (slides.length === 0 || !current) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ color: "var(--ink-3)", fontSize: 14 }}>
        No slides to display yet.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col" style={{ minHeight: 0, gap: 12 }}>
      {/* Stage wrapper — clips and centers the scaled slide */}
      <div className="flex flex-1 items-center justify-center overflow-hidden" style={{
        minHeight: 0,
        background: "var(--bg)",
        borderRadius: 8,
        border: "1px solid var(--line)",
        position: "relative",
      }}>
        <div
          ref={stageRef}
          style={{
            width: W, height: H,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
            flexShrink: 0,
          }}
        >
          <SlideStage slide={current} palette={palette} />
        </div>

        {/* Nav arrows overlaid on the viewport corners */}
        <button
          onClick={() => go(idx - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-100"
          style={{
            background: "var(--paper)", border: "1px solid var(--line)",
            borderRadius: 999, padding: 10, cursor: "pointer", opacity: 0.7,
          }}
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} style={{ color: "var(--ink)" }} />
        </button>
        <button
          onClick={() => go(idx + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-100"
          style={{
            background: "var(--paper)", border: "1px solid var(--line)",
            borderRadius: 999, padding: 10, cursor: "pointer", opacity: 0.7,
          }}
          aria-label="Next slide"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} style={{ color: "var(--ink)" }} />
        </button>

        {/* Slide counter pill (bottom-center) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2" style={{
          background: "var(--paper)", border: "1px solid var(--line)",
          borderRadius: 999, padding: "4px 12px",
          fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-2)",
          letterSpacing: 1.2,
        }}>
          {idx + 1} / {slides.length} · {current.layout}
        </div>
      </div>

      {/* Thumbnail rail */}
      <div className="flex gap-1.5 overflow-x-auto" style={{ paddingBottom: 4 }}>
        {slides.map((s, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            className="shrink-0 transition-all"
            title={`${i + 1}. ${s.title}`}
            style={{
              width: 72, height: 40,
              border: "1px solid " + (i === idx ? palette.accent1 : "var(--line)"),
              borderRadius: 4,
              background: i === idx ? `color-mix(in oklch, ${palette.accent1} 15%, transparent)` : "var(--paper)",
              cursor: "pointer",
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--ink-3)",
              padding: "2px 4px",
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {i + 1}. {s.title.slice(0, 14)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Stage: renders a single slide at 1920x1080 ─────────────────────────────

function SlideStage({ slide, palette }: { slide: DeepResearchSlide; palette: PresentationPalette }) {
  const accent = slide.accent_color || palette.accent1;
  const baseStyle: React.CSSProperties = {
    width: W, height: H,
    background: palette.bg,
    color: palette.text,
    fontFamily: palette.font_body || "'Inter', 'Segoe UI', sans-serif",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };
  const headingFont = palette.font_heading || "'Inter', 'Segoe UI', sans-serif";

  switch (slide.layout) {
    case "title":             return <TitleLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "key_insight":       return <KeyInsightLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "bullets":           return <BulletsLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "data":              return <DataLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "quote":             return <QuoteLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "comparison":        return <ComparisonLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "image_right":       return <ImageSideLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} imageOnRight />;
    case "image_left":        return <ImageSideLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} imageOnRight={false} />;
    case "full_image":        return <FullImageLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "stats_grid":        return <StatsGridLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "timeline":          return <TimelineLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "swot_grid":         return <SwotGridLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "process_flow":      return <ProcessFlowLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "before_after":      return <BeforeAfterLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    case "conclusion":        return <ConclusionLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
    default:                  return <BulletsLayout slide={slide} palette={palette} accent={accent} headingFont={headingFont} style={baseStyle} />;
  }
}

type LayoutProps = {
  slide: DeepResearchSlide;
  palette: PresentationPalette;
  accent: string;
  headingFont: string;
  style: React.CSSProperties;
};

// Each layout function below uses the SAME 1920x1080 frame but lays out
// content differently. Sizing values (font-size 60-120px etc.) are tuned
// for the full-resolution stage; the parent transform: scale() handles
// the actual on-screen size.

function TitleLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  return (
    <div style={{
      ...style,
      background: `linear-gradient(135deg, ${palette.gradient_start || accent} 0%, ${palette.gradient_end || palette.bg} 100%)`,
      justifyContent: "center", alignItems: "center", textAlign: "center",
      padding: 160,
    }}>
      <h1 style={{ fontFamily: headingFont, fontSize: 96, lineHeight: 1.05, margin: 0, color: palette.text, fontWeight: 800, letterSpacing: -2 }}>
        {slide.title}
      </h1>
      {slide.highlight && (
        <div style={{ marginTop: 48, fontSize: 36, color: palette.text_secondary || palette.text, opacity: 0.85 }}>
          {slide.highlight}
        </div>
      )}
      {slide.content.length > 0 && (
        <div style={{ marginTop: 32, fontSize: 28, color: palette.text_secondary || palette.text, opacity: 0.75 }}>
          {flatten(slide.content[0])}
        </div>
      )}
    </div>
  );
}

function KeyInsightLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  return (
    <div style={{ ...style, padding: 120, justifyContent: "center" }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      <div className="flex items-center" style={{ gap: 80, marginTop: 80, flex: 1 }}>
        <div style={{
          fontSize: 240, fontFamily: headingFont, fontWeight: 900, color: accent, lineHeight: 1, letterSpacing: -8,
        }}>
          {slide.highlight || "—"}
        </div>
        <div style={{ flex: 1, fontSize: 36, lineHeight: 1.4, color: palette.text }}>
          {slide.content.map((c, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "24px 0 0" }}>{flatten(c)}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function BulletsLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  return (
    <div style={{ ...style, padding: 120 }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      {slide.highlight && (
        <div style={{
          marginTop: 40, display: "inline-block",
          padding: "12px 28px", borderRadius: 999,
          background: palette.highlight_bg || `${accent}33`, color: accent,
          fontSize: 28, fontWeight: 700, fontFamily: headingFont,
        }}>
          {slide.highlight}
        </div>
      )}
      <ul style={{ marginTop: 56, listStyle: "none", padding: 0, fontSize: 36, lineHeight: 1.45 }}>
        {slide.content.map((c, i) => (
          <li key={i} style={{ display: "flex", gap: 24, marginBottom: 28, alignItems: "flex-start" }}>
            <span style={{ color: accent, fontWeight: 900, fontSize: 32, lineHeight: 1.45 }}>●</span>
            <span>{flatten(c)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  return (
    <div style={{ ...style, padding: 120 }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      {slide.highlight && (
        <div style={{
          marginTop: 60, fontSize: 200, fontFamily: headingFont, fontWeight: 900,
          color: accent, lineHeight: 1, letterSpacing: -6,
        }}>
          {slide.highlight}
        </div>
      )}
      <div style={{ marginTop: 60, fontSize: 32, lineHeight: 1.4, color: palette.text }}>
        {slide.content.map((c, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : "20px 0 0" }}>{flatten(c)}</p>
        ))}
      </div>
    </div>
  );
}

function QuoteLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  const quoteText = slide.content[0] ? flatten(slide.content[0]) : slide.title;
  const author = slide.content[1] ? flatten(slide.content[1]) : "";
  return (
    <div style={{ ...style, padding: 160, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: 200, fontFamily: headingFont, color: accent, lineHeight: 0.5, marginBottom: 24 }}>"</div>
      <div style={{
        fontSize: 56, fontFamily: headingFont, fontStyle: "italic", color: palette.text,
        lineHeight: 1.3, maxWidth: 1400,
      }}>
        {quoteText}
      </div>
      {author && (
        <div style={{ marginTop: 48, fontSize: 28, color: palette.text_secondary, letterSpacing: 2 }}>
          — {author}
        </div>
      )}
    </div>
  );
}

function ComparisonLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  // content shape: [["Option A", "..."], ["Option B", "..."]]
  const pairs = slide.content.filter(Array.isArray) as (string | number)[][];
  const a = pairs[0] ?? ["Option A", ""];
  const b = pairs[1] ?? ["Option B", ""];
  return (
    <div style={{ ...style, padding: 120 }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      <div className="grid grid-cols-2" style={{ marginTop: 64, gap: 48, flex: 1 }}>
        <ComparisonCard label={String(a[0])} body={String(a[1] ?? "")} palette={palette} accent={accent} headingFont={headingFont} />
        <ComparisonCard label={String(b[0])} body={String(b[1] ?? "")} palette={palette} accent={palette.accent2 || accent} headingFont={headingFont} />
      </div>
    </div>
  );
}

function ComparisonCard({ label, body, palette, accent, headingFont }: { label: string; body: string; palette: PresentationPalette; accent: string; headingFont: string }) {
  return (
    <div style={{
      background: palette.card_bg || palette.bg,
      border: `2px solid ${accent}`,
      borderRadius: 16,
      padding: 56,
      display: "flex",
      flexDirection: "column",
      gap: 32,
    }}>
      <div style={{ fontFamily: headingFont, fontSize: 48, fontWeight: 800, color: accent }}>{label}</div>
      <div style={{ fontSize: 30, lineHeight: 1.4, color: palette.text }}>{body}</div>
    </div>
  );
}

function ImageSideLayout({ slide, palette, accent, headingFont, style, imageOnRight }: LayoutProps & { imageOnRight: boolean }) {
  const imageBlock = (
    <div style={{
      flex: 1, background: palette.card_bg || "#0008",
      borderRadius: 16,
      overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {slide.image_url ? (
        <img src={slide.image_url} alt={slide.image_query || slide.title}
             style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ color: palette.text_secondary, fontSize: 24, fontStyle: "italic", padding: 40, textAlign: "center" }}>
          {slide.image_query ? `[${slide.image_query}]` : "[image placeholder]"}
        </div>
      )}
    </div>
  );
  const textBlock = (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <h2 style={{ fontFamily: headingFont, fontSize: 64, lineHeight: 1.1, margin: 0, color: accent, fontWeight: 800, letterSpacing: -1 }}>
        {slide.title}
      </h2>
      {slide.highlight && (
        <div style={{ marginTop: 24, fontSize: 32, color: palette.kpi_text || accent, fontWeight: 700 }}>{slide.highlight}</div>
      )}
      <ul style={{ marginTop: 32, listStyle: "none", padding: 0, fontSize: 28, lineHeight: 1.45 }}>
        {slide.content.map((c, i) => (
          <li key={i} style={{ display: "flex", gap: 16, marginBottom: 18 }}>
            <span style={{ color: accent }}>●</span><span>{flatten(c)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div style={{ ...style, padding: 96, flexDirection: "row", gap: 48 }}>
      {imageOnRight ? <>{textBlock}{imageBlock}</> : <>{imageBlock}{textBlock}</>}
    </div>
  );
}

function FullImageLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  return (
    <div style={{ ...style, position: "relative" }}>
      {slide.image_url ? (
        <img src={slide.image_url} alt={slide.image_query || slide.title}
             style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      {/* Dark gradient overlay for legibility */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)",
      }} />
      <div style={{ position: "relative", marginTop: "auto", padding: 120, color: "#fff" }}>
        <h2 style={{ fontFamily: headingFont, fontSize: 96, fontWeight: 900, margin: 0, letterSpacing: -2, lineHeight: 1 }}>
          {slide.title}
        </h2>
        {slide.highlight && (
          <div style={{ marginTop: 32, fontSize: 36, opacity: 0.9 }}>{slide.highlight}</div>
        )}
      </div>
    </div>
  );
}

function StatsGridLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  // content: [["Metric label", "Value"], ...]
  const pairs = slide.content.filter(Array.isArray) as (string | number)[][];
  const cols = pairs.length <= 2 ? 2 : pairs.length === 3 ? 3 : 4;
  return (
    <div style={{ ...style, padding: 120 }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      <div className={`grid grid-cols-${cols}`} style={{
        marginTop: 80, gap: 32, flex: 1,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}>
        {pairs.map((p, i) => (
          <div key={i} style={{
            background: palette.card_bg || palette.bg,
            border: `1px solid ${palette.card_border || accent + "55"}`,
            borderRadius: 16,
            padding: 48,
            display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
            textAlign: "center",
          }}>
            <div style={{ fontFamily: headingFont, fontSize: 120, fontWeight: 900, color: i % 2 === 0 ? accent : (palette.accent2 || accent), lineHeight: 1, letterSpacing: -3 }}>
              {String(p[1] ?? "")}
            </div>
            <div style={{ marginTop: 24, fontSize: 22, color: palette.text_secondary || palette.text, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
              {String(p[0] ?? "")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  const events = slide.content.filter(Array.isArray) as (string | number)[][];
  return (
    <div style={{ ...style, padding: 120 }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      <div style={{ marginTop: 80, position: "relative", flex: 1 }}>
        <div style={{
          position: "absolute", left: 100, right: 100, top: 80, height: 4,
          background: `linear-gradient(to right, ${accent}, ${palette.accent2 || accent})`,
        }} />
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 48 }}>
          {events.map((ev, i) => (
            <div key={i} style={{ flex: 1, padding: "0 24px", position: "relative", textAlign: "center" }}>
              <div style={{
                position: "absolute", top: -64, left: "50%", transform: "translateX(-50%)",
                width: 32, height: 32, borderRadius: "50%", background: accent,
                border: `4px solid ${palette.bg}`,
              }} />
              <div style={{ fontFamily: headingFont, fontSize: 36, fontWeight: 800, color: accent }}>
                {String(ev[0] ?? "")}
              </div>
              <div style={{ marginTop: 16, fontSize: 22, color: palette.text, lineHeight: 1.4 }}>
                {String(ev[1] ?? "")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SwotGridLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  const cells = slide.content.filter(Array.isArray) as (string | number)[][];
  const labels = ["Fortalezas", "Debilidades", "Oportunidades", "Amenazas"];
  const colors = [
    palette.success || "#10b981",
    palette.error || "#ef4444",
    palette.accent1,
    palette.warning || "#f59e0b",
  ];
  return (
    <div style={{ ...style, padding: 120 }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      <div className="grid grid-cols-2 grid-rows-2" style={{
        marginTop: 64, gap: 24, flex: 1,
        gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr",
      }}>
        {labels.map((label, i) => {
          const cell = cells[i] || ["", ""];
          const items = String(cell[1] ?? cell[0] ?? "").split(/[,•;\n]/).map(s => s.trim()).filter(Boolean);
          return (
            <div key={i} style={{
              background: palette.card_bg || palette.bg,
              borderTop: `6px solid ${colors[i]}`,
              borderRadius: 12,
              padding: 40,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ fontFamily: headingFont, fontSize: 32, fontWeight: 800, color: colors[i], letterSpacing: 1, textTransform: "uppercase" }}>
                {String(cell[0] || label)}
              </div>
              <ul style={{ listStyle: "none", padding: 0, marginTop: 16, fontSize: 22, lineHeight: 1.4, color: palette.text }}>
                {items.slice(0, 5).map((it, j) => (
                  <li key={j} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                    <span style={{ color: colors[i] }}>●</span><span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProcessFlowLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  const steps = slide.content.filter(Array.isArray) as (string | number)[][];
  return (
    <div style={{ ...style, padding: 120 }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      <div className="flex items-stretch" style={{ marginTop: 80, gap: 24, flex: 1 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              flex: 1, height: "100%", display: "flex", flexDirection: "column",
              background: palette.card_bg || palette.bg, padding: 40, borderRadius: 12,
              border: `1px solid ${palette.card_border || accent + "33"}`,
              borderLeft: `6px solid ${accent}`,
            }}>
              <div style={{
                fontFamily: headingFont, fontSize: 18, fontWeight: 700, letterSpacing: 2,
                color: accent, textTransform: "uppercase",
              }}>
                Paso {i + 1}
              </div>
              <div style={{ fontFamily: headingFont, fontSize: 30, fontWeight: 700, marginTop: 8, color: palette.text }}>
                {String(s[0] ?? "")}
              </div>
              <div style={{ marginTop: 12, fontSize: 22, lineHeight: 1.4, color: palette.text_secondary || palette.text }}>
                {String(s[1] ?? "")}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ color: accent, fontSize: 64, fontWeight: 300 }}>→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BeforeAfterLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  const pairs = slide.content.filter(Array.isArray) as (string | number)[][];
  const before = pairs[0] ?? ["Antes", ""];
  const after = pairs[1] ?? ["Después", ""];
  return (
    <div style={{ ...style, padding: 120 }}>
      <SlideHeader title={slide.title} accent={accent} headingFont={headingFont} />
      <div className="grid grid-cols-2" style={{ marginTop: 80, gap: 32, flex: 1, gridTemplateColumns: "1fr 1fr" }}>
        <ComparisonCard label={String(before[0])} body={String(before[1] ?? "")} palette={palette}
                        accent={palette.error || "#9ca3af"} headingFont={headingFont} />
        <ComparisonCard label={String(after[0])} body={String(after[1] ?? "")} palette={palette}
                        accent={palette.success || accent} headingFont={headingFont} />
      </div>
    </div>
  );
}

function ConclusionLayout({ slide, palette, accent, headingFont, style }: LayoutProps) {
  return (
    <div style={{
      ...style,
      background: `linear-gradient(135deg, ${palette.bg} 0%, ${palette.gradient_start || accent}22 100%)`,
      padding: 160, justifyContent: "center",
    }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 22, color: accent, letterSpacing: 4, textTransform: "uppercase", marginBottom: 32, fontWeight: 700 }}>
        Conclusión & próximos pasos
      </div>
      <h2 style={{ fontFamily: headingFont, fontSize: 72, lineHeight: 1.1, margin: 0, color: palette.text, fontWeight: 800, letterSpacing: -1 }}>
        {slide.title}
      </h2>
      {slide.highlight && (
        <div style={{ marginTop: 40, fontSize: 36, color: accent, fontWeight: 700 }}>{slide.highlight}</div>
      )}
      <ol style={{ marginTop: 56, paddingLeft: 0, listStyle: "none", fontSize: 32, lineHeight: 1.5, color: palette.text }}>
        {slide.content.map((c, i) => (
          <li key={i} style={{ display: "flex", gap: 24, marginBottom: 24, alignItems: "flex-start" }}>
            <span style={{
              flexShrink: 0,
              width: 56, height: 56, borderRadius: "50%", background: accent, color: palette.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: headingFont, fontWeight: 800, fontSize: 28,
            }}>
              {i + 1}
            </span>
            <span style={{ paddingTop: 10 }}>{flatten(c)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function SlideHeader({ title, accent, headingFont }: { title: string; accent: string; headingFont: string }) {
  return (
    <h2 style={{
      fontFamily: headingFont, fontSize: 64, lineHeight: 1.1, margin: 0, color: accent,
      fontWeight: 800, letterSpacing: -1,
    }}>
      {title}
    </h2>
  );
}

function flatten(c: string | (string | number)[]): string {
  if (Array.isArray(c)) return c.map(String).join(" — ");
  return String(c);
}
