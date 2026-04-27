"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Project, SharpenResponse } from "@/lib/types";
import { Chip, Dot, Divider, Logo } from "@/lib/v2/primitives";

/** Briefing field keys that the /sharpen endpoint accepts. Audience is excluded
 *  because it's a chip selection, not free text. */
const SHARPENABLE_FIELDS = ["central_question", "desired_decision", "situation", "complication"] as const;
type SharpenableField = (typeof SHARPENABLE_FIELDS)[number];

// ────────────────────────────────────────────────────────────────
// Briefing field config — mirrors design_handoff/src/deeper-views.jsx
// ────────────────────────────────────────────────────────────────

type BriefingField = {
  key: "central_question" | "audience" | "desired_decision" | "situation" | "complication";
  label: string;
  hint: string;
  serif?: boolean;
  chips?: string[];
  maxWords?: number;
  placeholder: string;
};

const FIELDS: BriefingField[] = [
  {
    key: "central_question",
    label: "Central question",
    hint: "Decision-oriented. Pyramid Principle requires a single, sharp question.",
    serif: true,
    maxWords: 25,
    placeholder: "Should Acme Corp enter the Latin American market in 2026 — and if so, which countries first?",
  },
  {
    key: "audience",
    label: "Audience",
    hint: "Sets slide cap, tone, jargon level.",
    chips: ["Board / C-suite", "Client (external)", "Working team", "Steering committee"],
    placeholder: "Board / C-suite (12 members)",
  },
  {
    key: "desired_decision",
    label: "Desired decision",
    hint: "Concrete, actionable. Not 'understand the market'.",
    placeholder: "Approve $10M phased investment in Brazil and Mexico over 18 months",
  },
  {
    key: "situation",
    label: "Situation",
    hint: "What the audience already knows.",
    placeholder: "Acme has saturated the North American market with 35% share and needs new growth vectors to meet 2027 revenue targets.",
  },
  {
    key: "complication",
    label: "Complication",
    hint: "What creates urgency.",
    placeholder: "Organic growth in NA has slowed to 3% YoY while LatAm digital adoption is accelerating at 15% CAGR — the window is closing.",
  },
];

type CoachItem = {
  tone: "warn" | "accent" | "ghost";
  title: string;
  sub: string;
};

const COACH_DEFAULTS: CoachItem[] = [
  { tone: "ghost", title: "Lock the central question first", sub: "Once defined, every slide must defend an answer to it." },
  { tone: "accent", title: "Audience size matters", sub: "Boards (≤12 members) → max 12 slides, lead with the ask." },
  { tone: "warn", title: "Decision must be concrete", sub: "'Understand the market' is not a decision. 'Approve $X investment' is." },
  { tone: "ghost", title: "Situation is uncontroversial", sub: "If the audience would dispute it, move it to Complication." },
];

const AUDIENCE_PRESETS = [
  { name: "Board", slides: "≤12", emp: "Lead with ask" },
  { name: "Client", slides: "≤20", emp: "Insight + actionable" },
  { name: "Working team", slides: "≤30", emp: "Include methodology" },
  { name: "Steering", slides: "≤10", emp: "Status + decisions" },
];

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ────────────────────────────────────────────────────────────────
// Briefing page
// ────────────────────────────────────────────────────────────────

export default function BriefingPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Live status label streamed from the SSE response (research/synthesize/etc.). */
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  // Form state
  const [values, setValues] = useState<Record<string, string>>({
    central_question: "",
    audience: "Board / C-suite",
    desired_decision: "",
    situation: "",
    complication: "",
  });

  // Sharpen state — tracks the per-field preview being shown and global runs
  const [sharpenLoadingField, setSharpenLoadingField] = useState<SharpenableField | null>(null);
  const [singlePreview, setSinglePreview] = useState<{ field: SharpenableField; res: SharpenResponse } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchPreviews, setBatchPreviews] = useState<{ field: SharpenableField; res: SharpenResponse; selected: boolean }[] | null>(null);

  // Load project + existing stage_data
  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      api.projects.get(projectId),
      api.sessions.getOrCreate(projectId),
    ])
      .then(([proj, session]) => {
        setProject(proj);
        const data = (session.stage_data ?? {}) as Record<string, unknown>;
        setValues((prev) => ({
          ...prev,
          central_question: typeof data.central_question === "string" ? data.central_question : "",
          audience: typeof data.audience === "string" ? data.audience : prev.audience,
          desired_decision: typeof data.desired_decision === "string" ? data.desired_decision : "",
          situation: typeof data.situation === "string" ? data.situation : "",
          complication: typeof data.complication === "string" ? data.complication : "",
        }));
      })
      .catch((err) => toast.error("Failed to load engagement: " + err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  function setValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  /**
   * Sharpen a single briefing field. Opens a preview dialog with apply/discard.
   */
  async function sharpenField(field: SharpenableField) {
    const current = values[field] ?? "";
    if (!current.trim()) {
      toast.error("Field is empty — write a draft first");
      return;
    }
    setSharpenLoadingField(field);
    try {
      const res = await api.sharpen.request(projectId, {
        target: "briefing_field",
        field,
        options: { current_value: current },
      });
      setSinglePreview({ field, res });
    } catch (err) {
      toast.error("Sharpen failed: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setSharpenLoadingField(null);
    }
  }

  /**
   * Sharpen every non-empty sharpenable field in parallel and surface a batch
   * dialog where the user can pick which suggestions to apply.
   */
  async function sharpenAll() {
    const targets = SHARPENABLE_FIELDS.filter((f) => (values[f] ?? "").trim());
    if (targets.length === 0) {
      toast.error("Nothing to sharpen — write some drafts first");
      return;
    }
    setBatchRunning(true);
    try {
      const results = await Promise.all(
        targets.map((field) =>
          api.sharpen
            .request(projectId, {
              target: "briefing_field",
              field,
              options: { current_value: values[field] },
            })
            .then((res) => ({ field, res, selected: true }))
            .catch((err) => {
              toast.error(`Sharpen ${field} failed: ${err instanceof Error ? err.message : "?"}`);
              return null;
            }),
        ),
      );
      const ok = results.filter((r): r is { field: SharpenableField; res: SharpenResponse; selected: boolean } => r !== null);
      if (ok.length === 0) {
        toast.error("All sharpen requests failed");
        return;
      }
      setBatchPreviews(ok);
    } finally {
      setBatchRunning(false);
    }
  }

  function applySinglePreview() {
    if (!singlePreview) return;
    const after = singlePreview.res.after;
    if (typeof after === "string") {
      setValue(singlePreview.field, after);
      toast.success("Field updated · review and continue");
    }
    setSinglePreview(null);
  }

  function applyBatch() {
    if (!batchPreviews) return;
    let applied = 0;
    setValues((prev) => {
      const next = { ...prev };
      for (const item of batchPreviews) {
        if (item.selected && typeof item.res.after === "string") {
          next[item.field] = item.res.after;
          applied++;
        }
      }
      return next;
    });
    toast.success(`Applied ${applied} sharpening${applied === 1 ? "" : "s"}`);
    setBatchPreviews(null);
  }

  /**
   * Submit the briefing as a synthesized chat message, parse the SSE stream,
   * surface live progress (text tokens + research-agent events), then route
   * to the canonical Workspace where the conversation continues.
   */
  async function handleAdvance() {
    if (!values.central_question.trim()) {
      toast.error("Central question is required");
      return;
    }
    setSaving(true);
    setProgressLabel("Sending briefing…");
    try {
      const session = await api.sessions.getOrCreate(projectId);
      const summary = [
        `Central question: ${values.central_question}`,
        `Audience: ${values.audience}`,
        `Desired decision: ${values.desired_decision}`,
        values.situation && `Situation: ${values.situation}`,
        values.complication && `Complication: ${values.complication}`,
        "Confirmo todos los inputs y avanza a Stage 2.",
      ]
        .filter(Boolean)
        .join("\n\n");

      const response = await api.sessions.sendMessage(session.id, summary, {
        use_web_search: false,
        research_depth: "standard",
        auto_refine: false,
      });

      if (response.body) {
        // Parse SSE stream for live progress feedback
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let tokensCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            // Research events: surface a tighter status line
            if (line.startsWith("event: research") && li + 1 < lines.length && lines[li + 1].startsWith("data: ")) {
              try {
                const ev = JSON.parse(lines[li + 1].slice(6));
                if (ev.type === "plan_start") setProgressLabel("Planning research…");
                else if (ev.type === "plan_done") setProgressLabel(`Research plan ready (${ev.num_steps} steps)`);
                else if (ev.type === "step_start") setProgressLabel(`Searching: ${(ev.sub_question || "").slice(0, 60)}…`);
                else if (ev.type === "synthesize_start") setProgressLabel("Synthesizing findings…");
                else if (ev.type === "research_complete") setProgressLabel("Research complete");
                li++;
              } catch {
                /* skip */
              }
              continue;
            }
            // Plain text — show "AI is replying" once tokens start flowing
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "text") {
                  tokensCount++;
                  if (tokensCount === 1) setProgressLabel("AI is replying…");
                }
              } catch {
                /* skip */
              }
            }
          }
        }
      }

      toast.success("Briefing locked — opening workspace");
      router.push(`/v2/engagements/${projectId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to advance");
      setSaving(false);
      setProgressLabel(null);
    }
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{
          padding: "12px 24px",
          borderColor: "var(--line)",
          background: "var(--paper)",
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/v2/engagements/${projectId}`)}
            className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
            style={{
              background: "transparent",
              color: "var(--ink-2)",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--sans)",
              cursor: "pointer",
              border: "1px solid transparent",
            }}
          >
            <ArrowLeft className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Workspace
          </button>
          <Logo size={14} />
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span style={{ fontSize: 13, fontFamily: "var(--serif)" }}>
            {project?.name ?? "Engagement"} · Briefing
          </span>
        </div>
        <div className="flex gap-2">
          <button
            disabled={saving}
            className="transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{
              background: "transparent",
              color: "var(--ink-2)",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--sans)",
              cursor: "pointer",
              border: "1px solid transparent",
            }}
            onClick={() => toast("Draft auto-saves on every change")}
          >
            Save draft
          </button>
          <button
            onClick={handleAdvance}
            disabled={saving || !values.central_question.trim()}
            className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: "var(--ink)",
              color: "var(--paper)",
              border: "1px solid var(--ink)",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--sans)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? (
              <>
                <Loader2 className="h-[13px] w-[13px] animate-spin" />
                {progressLabel ?? "Working…"}
              </>
            ) : (
              <>
                Continue to Stage 02
                <ArrowRight className="h-[13px] w-[13px]" strokeWidth={1.5} />
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── 2-column body: form + coach ─────────────────── */}
      <div
        className="grid flex-1 overflow-hidden"
        style={{ gridTemplateColumns: "1fr 360px", minHeight: 0 }}
      >
        {/* ── Form ──────────────────────────────────────── */}
        <div className="overflow-auto" style={{ padding: "44px 56px" }}>
          <div style={{ maxWidth: 720 }}>
            <div className="v2-kicker mb-2">Stage 01 · Define problem</div>
            <h1 className="v2-h1 m-0 mb-3">Brief the engagement.</h1>
            <p
              className="mb-9 mt-0"
              style={{ fontSize: 14, color: "var(--ink-3)", maxWidth: 540 }}
            >
              Pyramid Principle works backward from a single, sharp question. Get this right and every slide will defend a clear answer. The AI will challenge anything fuzzy.
            </p>

            {loading ? (
              <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span style={{ fontSize: 13 }}>Loading briefing…</span>
              </div>
            ) : (
              <>
                {FIELDS.map((f) => {
                  const value = values[f.key] ?? "";
                  const wordCount = countWords(value);
                  const isSharpenable = (SHARPENABLE_FIELDS as readonly string[]).includes(f.key);
                  const isLoading = sharpenLoadingField === f.key;
                  return (
                    <div
                      key={f.key}
                      className="mb-7 pb-7"
                      style={{ borderBottom: "1px dashed var(--line)" }}
                    >
                      <div className="mb-2 flex items-baseline justify-between">
                        <label
                          className="flex items-center gap-2"
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--ink)",
                          }}
                        >
                          {f.label}
                          {isSharpenable && (
                            <button
                              onClick={() => sharpenField(f.key as SharpenableField)}
                              disabled={isLoading || !value.trim() || batchRunning}
                              title="Sharpen this field with AI"
                              className="cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
                              style={{
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                color: "var(--accent)",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              aria-label={`Sharpen ${f.label}`}
                            >
                              {isLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                              )}
                            </button>
                          )}
                        </label>
                        {value && (
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 10,
                              color: "var(--ink-4)",
                            }}
                          >
                            {wordCount} words
                            {f.maxWords ? ` · target ≤${f.maxWords}` : ""}
                          </span>
                        )}
                      </div>
                      <textarea
                        value={value}
                        onChange={(e) => setValue(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full"
                        style={{
                          fontFamily: f.serif ? "var(--serif)" : "var(--sans)",
                          fontSize: f.serif ? 22 : 14,
                          lineHeight: 1.4,
                          letterSpacing: f.serif ? -0.3 : 0,
                          minHeight: f.serif ? 70 : 62,
                          resize: "vertical",
                        }}
                      />
                      {f.chips && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {f.chips.map((c) => (
                            <button
                              key={c}
                              onClick={() => setValue(f.key, c)}
                              className="cursor-pointer transition-opacity hover:opacity-80"
                              style={{ background: "transparent", border: "none", padding: 0 }}
                            >
                              <Chip tone={value.startsWith(c) ? "accent" : "ghost"}>
                                {c}
                              </Chip>
                            </button>
                          ))}
                        </div>
                      )}
                      <div
                        className="mt-2 italic"
                        style={{ fontSize: 12, color: "var(--ink-3)" }}
                      >
                        {f.hint}
                      </div>
                    </div>
                  );
                })}

                <div className="mt-2 flex gap-2">
                  <button
                    onClick={sharpenAll}
                    disabled={batchRunning || sharpenLoadingField !== null}
                    title="Sharpen every non-empty field at once and pick which suggestions to apply"
                    className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: "transparent",
                      color: "var(--ink-2)",
                      border: "1px solid transparent",
                      borderRadius: 6,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "var(--sans)",
                      cursor: batchRunning ? "not-allowed" : "pointer",
                    }}
                  >
                    {batchRunning ? (
                      <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.5} />
                    )}
                    {batchRunning ? "Sharpening all fields…" : "Sharpen with AI"}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={handleAdvance}
                    disabled={saving || !values.central_question.trim()}
                    className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: "var(--ink)",
                      color: "var(--paper)",
                      border: "1px solid var(--ink)",
                      borderRadius: 6,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "var(--sans)",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    {saving ? (
                      <Loader2 className="h-[15px] w-[15px] animate-spin" />
                    ) : (
                      <>
                        Lock & advance
                        <ArrowRight className="h-[15px] w-[15px]" strokeWidth={1.5} />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Coach rail ────────────────────────────────── */}
        <div
          className="overflow-auto border-l"
          style={{
            borderColor: "var(--line)",
            background: "var(--paper)",
            padding: "24px 22px",
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Sparkles
              className="h-[13px] w-[13px]"
              strokeWidth={1.5}
              style={{ color: "var(--accent)" }}
            />
            <span className="v2-kicker" style={{ fontSize: 11 }}>
              Coach
            </span>
          </div>
          <div
            className="mb-4"
            style={{
              fontFamily: "var(--serif)",
              fontSize: 17,
              lineHeight: 1.35,
              letterSpacing: -0.2,
              color: "var(--ink)",
            }}
          >
            Your central question is decision-shaped — good. Here are common things to tighten before Stage 02.
          </div>

          <div className="flex flex-col gap-2.5">
            {COACH_DEFAULTS.map((c, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--bg)",
                  borderRadius: 6,
                  padding: "10px 12px",
                }}
              >
                <div className="flex items-start gap-2">
                  <Dot
                    color={
                      c.tone === "warn"
                        ? "var(--warn)"
                        : c.tone === "accent"
                          ? "var(--accent)"
                          : "var(--ink-4)"
                    }
                    size={7}
                  />
                  <div className="flex-1">
                    <div style={{ fontSize: 13, color: "var(--ink)" }}>{c.title}</div>
                    <div
                      className="mt-0.5"
                      style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.4 }}
                    >
                      {c.sub}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Divider label="audience presets" className="mb-3.5 mt-7" />

          <div className="grid grid-cols-2 gap-2">
            {AUDIENCE_PRESETS.map((a, i) => {
              const selected = values.audience.startsWith(a.name);
              return (
                <button
                  key={a.name}
                  onClick={() => setValue("audience", a.name)}
                  className="text-left transition-opacity hover:opacity-90"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    background: selected ? "var(--accent-soft)" : "var(--bg)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{a.name}</div>
                  <div
                    className="mt-0.5"
                    style={{ fontSize: 11, color: "var(--ink-3)" }}
                  >
                    {a.slides} · {a.emp}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Single-field sharpen preview */}
      {singlePreview && (
        <BriefingSinglePreview
          field={singlePreview.field}
          res={singlePreview.res}
          fieldLabel={FIELDS.find((f) => f.key === singlePreview.field)?.label ?? singlePreview.field}
          onApply={applySinglePreview}
          onDiscard={() => setSinglePreview(null)}
        />
      )}

      {/* Batch sharpen preview */}
      {batchPreviews && (
        <BriefingBatchPreview
          previews={batchPreviews}
          fieldLabels={Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<string, string>}
          onToggle={(field) =>
            setBatchPreviews((prev) =>
              prev ? prev.map((p) => (p.field === field ? { ...p, selected: !p.selected } : p)) : prev,
            )
          }
          onApply={applyBatch}
          onDiscard={() => setBatchPreviews(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// BriefingSinglePreview — modal showing one before/after diff
// ────────────────────────────────────────────────────────────────

function BriefingSinglePreview({
  field,
  res,
  fieldLabel,
  onApply,
  onDiscard,
}: {
  field: SharpenableField;
  res: SharpenResponse;
  fieldLabel: string;
  onApply: () => void;
  onDiscard: () => void;
}) {
  void field;
  const before = typeof res.before === "string" ? res.before : "";
  const after = typeof res.after === "string" ? res.after : "";
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
            <Sparkles className="h-[14px] w-[14px]" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
            <span className="v2-kicker" style={{ fontSize: 11, letterSpacing: 1 }}>
              Sharpen · {fieldLabel}
            </span>
            <div className="flex-1" />
            <button
              onClick={onDiscard}
              className="cursor-pointer transition-opacity hover:opacity-70"
              style={{ background: "transparent", border: "none", padding: 4 }}
              aria-label="Discard"
            >
              <X className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
            </button>
          </div>

          <div className="overflow-y-auto" style={{ padding: "16px 20px", minHeight: 0 }}>
            <div className="v2-kicker mb-1.5" style={{ fontSize: 10 }}>Before</div>
            <div
              className="mb-3.5"
              style={{
                padding: "10px 12px",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--ink-3)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {before || "(empty)"}
            </div>

            <div className="v2-kicker mb-1.5" style={{ fontSize: 10 }}>After</div>
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
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {after || "(empty)"}
            </div>

            {res.rationale && (
              <>
                <div className="v2-kicker mb-1.5" style={{ fontSize: 10 }}>Why</div>
                <p className="m-0 italic" style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}>
                  {res.rationale}
                </p>
              </>
            )}
          </div>

          <div
            className="flex shrink-0 justify-end gap-1.5 border-t"
            style={{ padding: "12px 20px", borderColor: "var(--line)" }}
          >
            <button onClick={onDiscard} className="v2bp-ghost-btn">Discard</button>
            <button onClick={onApply} className="v2bp-default-btn">
              <Check className="h-[13px] w-[13px]" strokeWidth={2} />
              Apply
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(.v2-theme .v2bp-ghost-btn) {
          background: transparent; color: var(--ink-2); border: 1px solid var(--line-2);
          border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 500;
          font-family: var(--sans); cursor: pointer; transition: opacity 0.15s ease;
          display: inline-flex; align-items: center; gap: 6px;
        }
        :global(.v2-theme .v2bp-ghost-btn:hover) { opacity: 0.7; }
        :global(.v2-theme .v2bp-default-btn) {
          background: var(--ink); color: var(--paper); border: 1px solid var(--ink);
          border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 500;
          font-family: var(--sans); cursor: pointer; transition: opacity 0.15s ease;
          display: inline-flex; align-items: center; gap: 6px;
        }
        :global(.v2-theme .v2bp-default-btn:hover) { opacity: 0.9; }
      `}</style>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// BriefingBatchPreview — multi-field diff with per-field checkbox
// ────────────────────────────────────────────────────────────────

function BriefingBatchPreview({
  previews,
  fieldLabels,
  onToggle,
  onApply,
  onDiscard,
}: {
  previews: { field: SharpenableField; res: SharpenResponse; selected: boolean }[];
  fieldLabels: Record<string, string>;
  onToggle: (field: SharpenableField) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const selectedCount = previews.filter((p) => p.selected).length;
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
            maxWidth: 720,
            background: "var(--paper)",
            border: "1px solid var(--line-2)",
            borderRadius: 10,
            maxHeight: "88vh",
          }}
        >
          <div
            className="flex shrink-0 items-center gap-2.5 border-b"
            style={{ padding: "14px 20px", borderColor: "var(--line)" }}
          >
            <Sparkles className="h-[14px] w-[14px]" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
            <span className="v2-kicker" style={{ fontSize: 11, letterSpacing: 1 }}>
              Sharpen all fields · {previews.length} suggestions
            </span>
            <div className="flex-1" />
            <button
              onClick={onDiscard}
              className="cursor-pointer transition-opacity hover:opacity-70"
              style={{ background: "transparent", border: "none", padding: 4 }}
              aria-label="Discard"
            >
              <X className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
            </button>
          </div>

          <div className="overflow-y-auto flex flex-col gap-4" style={{ padding: "16px 20px", minHeight: 0 }}>
            {previews.map((p) => {
              const before = typeof p.res.before === "string" ? p.res.before : "";
              const after = typeof p.res.after === "string" ? p.res.after : "";
              return (
                <div
                  key={p.field}
                  style={{
                    border: "1px solid " + (p.selected ? "var(--accent)" : "var(--line)"),
                    borderRadius: 8,
                    padding: "12px 14px",
                    background: p.selected ? "color-mix(in oklch, var(--accent) 4%, var(--paper))" : "var(--paper)",
                  }}
                >
                  <label className="mb-2 flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => onToggle(p.field)}
                      className="cursor-pointer"
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
                      {fieldLabels[p.field] ?? p.field}
                    </span>
                  </label>

                  <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <div>
                      <div className="v2-kicker mb-1" style={{ fontSize: 9 }}>Before</div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--ink-3)",
                          lineHeight: 1.5,
                          padding: "8px 10px",
                          background: "var(--bg)",
                          border: "1px solid var(--line)",
                          borderRadius: 4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {before || "(empty)"}
                      </div>
                    </div>
                    <div>
                      <div className="v2-kicker mb-1" style={{ fontSize: 9 }}>After</div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--ink)",
                          lineHeight: 1.5,
                          padding: "8px 10px",
                          background: "color-mix(in oklch, var(--accent) 6%, var(--paper))",
                          border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
                          borderRadius: 4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {after || "(empty)"}
                      </div>
                    </div>
                  </div>

                  {p.res.rationale && (
                    <p
                      className="mt-2 m-0 italic"
                      style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}
                    >
                      {p.res.rationale}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="flex shrink-0 justify-end gap-1.5 border-t"
            style={{ padding: "12px 20px", borderColor: "var(--line)" }}
          >
            <button onClick={onDiscard} className="v2bp-ghost-btn">Discard all</button>
            <button onClick={onApply} disabled={selectedCount === 0} className="v2bp-default-btn">
              <Check className="h-[13px] w-[13px]" strokeWidth={2} />
              Apply {selectedCount} of {previews.length}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(.v2-theme .v2bp-ghost-btn) {
          background: transparent; color: var(--ink-2); border: 1px solid var(--line-2);
          border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 500;
          font-family: var(--sans); cursor: pointer; transition: opacity 0.15s ease;
          display: inline-flex; align-items: center; gap: 6px;
        }
        :global(.v2-theme .v2bp-ghost-btn:hover) { opacity: 0.7; }
        :global(.v2-theme .v2bp-default-btn) {
          background: var(--ink); color: var(--paper); border: 1px solid var(--ink);
          border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 500;
          font-family: var(--sans); cursor: pointer; transition: opacity 0.15s ease;
          display: inline-flex; align-items: center; gap: 6px;
        }
        :global(.v2-theme .v2bp-default-btn:hover) { opacity: 0.9; }
        :global(.v2-theme .v2bp-default-btn:disabled) { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </>
  );
}
