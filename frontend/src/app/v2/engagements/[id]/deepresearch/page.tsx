"use client";

/**
 * /v2/engagements/[id]/deepresearch
 *
 * One-shot DeepResearch-style slide deck generation from the imported report.
 * Lives parallel to the chat-driven McKinsey workspace (/v2/engagements/[id]).
 *
 * Flow:
 *   1. Load latest deck (if any) or show empty viewer.
 *   2. Form left, viewer right.
 *   3. On Generate: POST SSE; parse `data: {...}` events; on `slides` event
 *      update the viewer; on `done` enable export buttons.
 *   4. Export buttons: download JSON (browser nav to URL) + PPTX (POST + open).
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Download, FileJson, FileText, Loader2, Play, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  THEME_IDS,
  type DeepResearchDeck, type DeepResearchSlide,
  type GeneratePresentationBody, type PresentationOptions, type PresentationPalette,
} from "@/lib/types";
import { Chip, Logo } from "@/lib/v2/primitives";
import { V2SlideViewer } from "@/components/v2/v2-slide-viewer";

const DEFAULT_OPTIONS: PresentationOptions = {
  tone: "profesional",
  audience: "ejecutivo",
  language: undefined,
  focus: undefined,
  style_id: "default",
  style_mode: "dark",
};

const TONES = ["profesional", "casual", "técnico", "académico", "ejecutivo"] as const;
const AUDIENCES = ["general", "experto", "ejecutivo", "estudiante"] as const;
const MODES = ["dark", "light", "dim"] as const;
const IMAGE_PROVIDERS = ["none", "pexels", "unsplash", "ai"] as const;

type GenStatus = "idle" | "summarizing" | "generating" | "parsing" | "fetching_images" | "done" | "error";

export default function DeepResearchDeckPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  // Form state
  const [slideCount, setSlideCount] = useState(10);
  const [focus, setFocus] = useState("");
  const [options, setOptions] = useState<PresentationOptions>(DEFAULT_OPTIONS);
  const [imageProvider, setImageProvider] = useState<typeof IMAGE_PROVIDERS[number]>("none");

  // Viewer state
  const [slides, setSlides] = useState<DeepResearchSlide[]>([]);
  const [palette, setPalette] = useState<PresentationPalette | null>(null);
  const [presentationPromptMd, setPresentationPromptMd] = useState<string>("");

  // Generation state
  const [status, setStatus] = useState<GenStatus>("idle");
  const [progressChars, setProgressChars] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cancel handle
  const abortRef = useRef<AbortController | null>(null);

  // Load latest deck on mount
  useEffect(() => {
    if (!projectId) return;
    api.deepresearchDecks.get(projectId)
      .then((deck: DeepResearchDeck) => {
        setSlides(deck.slides);
        setPalette(deck.palette);
        setPresentationPromptMd(deck.presentation_prompt || "");
        setSlideCount(deck.options.slide_count || deck.slides.length || 10);
        if (deck.options.focus) setFocus(deck.options.focus);
        const merged: PresentationOptions = {
          tone: (deck.options.tone || DEFAULT_OPTIONS.tone) as PresentationOptions["tone"],
          audience: (deck.options.audience || DEFAULT_OPTIONS.audience) as PresentationOptions["audience"],
          language: deck.options.language,
          focus: deck.options.focus,
          style_id: deck.options.style_id || DEFAULT_OPTIONS.style_id,
          style_mode: (deck.options.style_mode || "dark") as PresentationOptions["style_mode"],
        };
        setOptions(merged);
        if (deck.image_provider && (IMAGE_PROVIDERS as readonly string[]).includes(deck.image_provider)) {
          setImageProvider(deck.image_provider as typeof IMAGE_PROVIDERS[number]);
        }
      })
      .catch(() => {
        /* No deck yet — that's fine, viewer stays empty */
      });
  }, [projectId]);

  const startGenerate = async () => {
    if (status === "generating" || status === "summarizing") {
      // Already running; cancel
      abortRef.current?.abort();
      return;
    }
    setStatus("summarizing");
    setSlides([]);
    setPresentationPromptMd("");
    setErrorMsg(null);
    setProgressChars(0);

    const controller = new AbortController();
    abortRef.current = controller;

    const body: GeneratePresentationBody = {
      slide_count: Math.max(5, Math.min(slideCount, 20)),
      image_provider: imageProvider,
      options: {
        ...options,
        focus: focus || undefined,
      },
    };

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/projects/${projectId}/deepresearch-deck/generate-with-meta`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        let dblIdx: number;
        while ((dblIdx = buffer.indexOf("\n\n")) >= 0) {
          const rawMsg = buffer.slice(0, dblIdx);
          buffer = buffer.slice(dblIdx + 2);
          for (const line of rawMsg.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            try {
              const ev = JSON.parse(data);
              handleEvent(ev);
            } catch {
              /* Ignore malformed event — defensive */
            }
          }
        }
      }
      // Drain trailing buffer
      if (buffer.trim().startsWith("data:")) {
        try { handleEvent(JSON.parse(buffer.slice(buffer.indexOf("data:") + 5).trim())); } catch {}
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("idle");
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatus("error");
      toast.error("Generation failed: " + msg);
    } finally {
      abortRef.current = null;
    }
  };

  const handleEvent = (ev: { type: string; [k: string]: unknown }) => {
    switch (ev.type) {
      case "status":
        setStatus((ev.stage as GenStatus) || "generating");
        if (ev.palette) setPalette(ev.palette as PresentationPalette);
        break;
      case "progress":
        setProgressChars(Number(ev.chars) || 0);
        break;
      case "slides":
        setSlides((ev.slides as DeepResearchSlide[]) || []);
        if (ev.palette) setPalette(ev.palette as PresentationPalette);
        if (typeof ev.presentation_prompt === "string") {
          setPresentationPromptMd(ev.presentation_prompt);
        }
        break;
      case "done":
        setStatus("done");
        toast.success(`${slides.length || "Deck"} ready`);
        break;
      case "error":
        setErrorMsg(String(ev.text || "Unknown error"));
        setStatus("error");
        break;
      case "saved":
        // Backend confirmed persistence — show subtle marker if we want
        break;
      default:
        break;
    }
  };

  const downloadJson = () => {
    const url = api.deepresearchDecks.downloadJsonUrl(projectId);
    window.open(url, "_blank");
  };

  const exportPptx = async () => {
    try {
      toast.loading("Building PPTX…", { id: "pptx" });
      const res = await api.deepresearchDecks.exportPptx(projectId);
      toast.success("PPTX ready · " + res.filename, { id: "pptx" });
      // The backend returns a relative download_url; open it in a new tab so
      // the user can grab the file. Backend serves /api/v1/exports/* via the
      // export router.
      window.open(`${process.env.NEXT_PUBLIC_API_URL || "/api/v1"}/exports/${res.filename}`, "_blank");
    } catch (err) {
      toast.error("PPTX export failed: " + (err instanceof Error ? err.message : "?"), { id: "pptx" });
    }
  };

  const isRunning = status === "summarizing" || status === "generating" || status === "parsing" || status === "fetching_images";

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* Top bar */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{ padding: "12px 24px", borderColor: "var(--line)", background: "var(--paper)" }}
      >
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => router.push(`/v2/engagements/${projectId}`)}
            className="inline-flex items-center transition-opacity hover:opacity-70"
            style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}
          >
            <ArrowLeft className="h-[14px] w-[14px]" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
          </button>
          <Logo size={14} />
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span style={{ fontFamily: "var(--serif)", fontSize: 14 }}>DeepResearch deck</span>
          {slides.length > 0 && <Chip size="xs" tone="ghost">{slides.length} slides</Chip>}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={downloadJson} disabled={slides.length === 0} className="v2-ghost-btn">
            <FileJson className="h-[13px] w-[13px]" strokeWidth={1.5} />
            JSON
          </button>
          <button onClick={exportPptx} disabled={slides.length === 0} className="v2-ghost-btn">
            <FileText className="h-[13px] w-[13px]" strokeWidth={1.5} />
            PPTX
          </button>
          {presentationPromptMd && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(presentationPromptMd)
                  .then(() => toast.success("Design brief copied to clipboard"))
                  .catch(() => toast.error("Clipboard write failed"));
              }}
              className="v2-ghost-btn"
              title="Copy the markdown design brief (handoff to designers)"
            >
              <Download className="h-[13px] w-[13px]" strokeWidth={1.5} />
              Brief
            </button>
          )}
        </div>
      </header>

      {/* Two-column body: form on left, viewer on right */}
      <div className="grid flex-1 overflow-hidden" style={{
        gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
        minHeight: 0,
      }}>
        {/* Form side */}
        <aside className="overflow-y-auto" style={{
          padding: "24px 24px 80px",
          borderRight: "1px solid var(--line)",
          background: "var(--paper)",
        }}>
          <div className="v2-kicker mb-2" style={{ fontSize: 10, letterSpacing: 1.5 }}>OPTIONS</div>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, letterSpacing: -0.4, lineHeight: 1.15, margin: 0 }}>
            Configure the deck
          </h2>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
            Same options exposed by deepresearch&apos;s <code>/presentation</code> endpoint. Generation
            runs once; preview updates in real-time on the right.
          </p>

          {/* Slide count */}
          <Field label="Slide count">
            <div className="flex items-center gap-3">
              <input
                type="range" min={5} max={20} step={1}
                value={slideCount}
                onChange={(e) => setSlideCount(parseInt(e.target.value, 10))}
                style={{ flex: 1, accentColor: "var(--accent)" }}
              />
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, width: 28, textAlign: "right" }}>{slideCount}</span>
            </div>
            <Hint>5 mín · 20 máx (deepresearch clamps this server-side)</Hint>
          </Field>

          {/* Focus */}
          <Field label="Focus directive">
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="ej: 'enfocate en oportunidades de mercado LatAm'"
              rows={2}
              style={inputStyle}
            />
            <Hint>Free-text. Gets injected into the prompt as &lt;enfoque_solicitado&gt;.</Hint>
          </Field>

          {/* Theme / mode */}
          <Field label="Theme">
            <select
              value={options.style_id}
              onChange={(e) => setOptions({ ...options, style_id: e.target.value })}
              style={inputStyle}
            >
              {THEME_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </Field>
          <Field label="Mode">
            <div className="flex gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setOptions({ ...options, style_mode: m })}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 12, fontFamily: "var(--sans)",
                    border: "1px solid var(--line-2)",
                    background: options.style_mode === m ? "var(--ink)" : "var(--paper)",
                    color: options.style_mode === m ? "var(--paper)" : "var(--ink-2)",
                    borderRadius: 6, cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>

          {/* Tone / Audience */}
          <Field label="Tone">
            <select
              value={options.tone}
              onChange={(e) => setOptions({ ...options, tone: e.target.value as PresentationOptions["tone"] })}
              style={inputStyle}
            >
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Audience">
            <select
              value={options.audience}
              onChange={(e) => setOptions({ ...options, audience: e.target.value as PresentationOptions["audience"] })}
              style={inputStyle}
            >
              {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>

          {/* Language */}
          <Field label="Output language (override)">
            <input
              value={options.language || ""}
              onChange={(e) => setOptions({ ...options, language: e.target.value || undefined })}
              placeholder="auto (detect from report)"
              style={inputStyle}
            />
            <Hint>ISO code: es, en, pt, fr, de. Leave blank to match the report.</Hint>
          </Field>

          {/* Image provider */}
          <Field label="Image provider">
            <select
              value={imageProvider}
              onChange={(e) => setImageProvider(e.target.value as typeof imageProvider)}
              style={inputStyle}
            >
              {IMAGE_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <Hint>
              pexels / unsplash require API keys (PEXELS_API_KEY / UNSPLASH_ACCESS_KEY) in the
              backend. If missing, slides render without images instead of failing.
            </Hint>
          </Field>

          {/* Generate / Cancel */}
          <button
            onClick={startGenerate}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{
              background: isRunning ? "var(--warn)" : "var(--ink)",
              color: "var(--paper)",
              border: "1px solid",
              borderColor: isRunning ? "var(--warn)" : "var(--ink)",
              borderRadius: 6,
              padding: "12px 18px",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "var(--sans)",
              cursor: "pointer",
            }}
          >
            {isRunning ? (
              <><Loader2 className="h-[14px] w-[14px] animate-spin" /> Cancel · {labelForStatus(status)}</>
            ) : status === "done" ? (
              <><Sparkles className="h-[14px] w-[14px]" strokeWidth={1.5} /> Regenerate</>
            ) : (
              <><Play className="h-[14px] w-[14px]" strokeWidth={1.5} fill="currentColor" /> Generate deck</>
            )}
          </button>

          {/* Progress + error */}
          {isRunning && (
            <div className="mt-3" style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
              {labelForStatus(status)}{progressChars > 0 ? ` · ${progressChars.toLocaleString()} chars` : ""}…
            </div>
          )}
          {errorMsg && (
            <div className="mt-3" style={{
              padding: "10px 12px",
              background: "color-mix(in oklch, var(--danger) 8%, transparent)",
              border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)",
              borderRadius: 6,
              fontSize: 12, color: "var(--ink-2)",
            }}>
              <strong style={{ color: "var(--danger)" }}>Error:</strong> {errorMsg}
            </div>
          )}
        </aside>

        {/* Viewer side */}
        <main style={{ padding: 24, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {slides.length === 0 ? (
            <EmptyState running={isRunning} status={status} />
          ) : palette ? (
            <V2SlideViewer slides={slides} palette={palette} />
          ) : null}
        </main>
      </div>

      {/* Inline button styles */}
      <style jsx>{`
        :global(.v2-theme .v2-ghost-btn) {
          background: transparent;
          color: var(--ink-2);
          border: 1px solid transparent;
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
        :global(.v2-theme .v2-ghost-btn:hover:not(:disabled)) { opacity: 0.7; }
        :global(.v2-theme .v2-ghost-btn:disabled) { opacity: 0.35; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block" style={{ marginTop: 18 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: 1.3, color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--ink-4)", lineHeight: 1.4 }}>{children}</div>;
}

function EmptyState({ running, status }: { running: boolean; status: GenStatus }) {
  return (
    <div className="flex flex-1 items-center justify-center" style={{
      border: "1px dashed var(--line-2)", borderRadius: 12, background: "var(--paper)",
      padding: 60, textAlign: "center", color: "var(--ink-3)",
    }}>
      <div>
        <div className="v2-kicker" style={{ fontSize: 11, letterSpacing: 1.5 }}>
          {running ? labelForStatus(status) : "NO DECK YET"}
        </div>
        <div className="mt-2" style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink-2)" }}>
          {running ? "Generating slides…" : "Configure & click Generate"}
        </div>
        <p className="mt-3" style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 420, margin: "12px auto 0", lineHeight: 1.5 }}>
          {running
            ? "The model is reading the report and producing slide JSON. This usually takes 30-60s for a 12-slide deck."
            : "The deck will appear here as slides stream in. You'll also get an HTML viewer with arrow-key nav + JSON / PPTX exports."}
        </p>
      </div>
    </div>
  );
}

function labelForStatus(s: GenStatus): string {
  return {
    idle: "Idle",
    summarizing: "Summarizing report",
    generating: "Generating slides",
    parsing: "Parsing output",
    fetching_images: "Fetching images",
    done: "Done",
    error: "Error",
  }[s];
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--line-2)",
  borderRadius: 6,
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--sans)",
  fontSize: 13,
  outline: "none",
};
