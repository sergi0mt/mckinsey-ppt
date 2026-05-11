"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ImportResult, InferredMetadata } from "@/lib/types";
import { AUDIENCE_OPTIONS, DECK_TYPE_OPTIONS, ENGAGEMENT_TEMPLATES } from "@/lib/types";
import { Chip, Logo } from "@/lib/v2/primitives";

type FormState = {
  name: string;
  central_question: string;
  desired_decision: string;
  audience: string;
  deck_type: string;
  engagement_template_id: string;
  hypothesis: string;
  output_language: string;
};

const LANGS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
];

export default function ImportConfirmPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [showBranches, setShowBranches] = useState(false);

  // Try sessionStorage first (fast path from /v2/import). Fallback: rebuild
  // from the project + session if user lands here directly (refresh, deep link).
  useEffect(() => {
    if (!projectId) return;
    const cached = typeof window !== "undefined"
      ? sessionStorage.getItem(`mckinsey-ppt:import:${projectId}`)
      : null;
    if (cached) {
      try {
        const parsed: ImportResult = JSON.parse(cached);
        setImported(parsed);
        setForm(formFromInferred(parsed.inferred));
        setLoading(false);
        return;
      } catch {
        /* fall through to network */
      }
    }
    // Fallback: fetch project + session and rebuild form from stage_data
    Promise.all([
      api.projects.get(projectId),
      api.sessions.getOrCreate(projectId),
    ])
      .then(([proj, sess]) => {
        const sd = (sess.stage_data ?? {}) as Record<string, unknown>;
        let branches: { question: string; evidence: string; so_what: string }[] = [];
        const branchesRaw = sd.branches;
        if (typeof branchesRaw === "string" && branchesRaw) {
          try { branches = JSON.parse(branchesRaw); } catch { /* ignore */ }
        } else if (Array.isArray(branchesRaw)) {
          branches = branchesRaw as typeof branches;
        }
        const inferred: InferredMetadata = {
          title: proj.name,
          central_question: typeof sd.central_question === "string" ? sd.central_question : "",
          desired_decision: typeof sd.desired_decision === "string" ? sd.desired_decision : "",
          audience: typeof sd.audience === "string" ? sd.audience : (proj.audience || "client"),
          deck_type: typeof sd.deck_type === "string" ? sd.deck_type : (proj.deck_type || "strategic"),
          engagement_template_id: proj.engagement_type ?? null,
          hypothesis: typeof sd.hypothesis === "string" ? sd.hypothesis : "",
          output_language: typeof sd.output_language === "string" ? sd.output_language : "en",
          branches,
        };
        const synth: ImportResult = {
          project_id: projectId,
          session_id: sess.id,
          upload_id: "",
          inferred,
          branches_detected_count: branches.length,
          report_word_count: typeof sd.report_word_count === "number" ? sd.report_word_count : 0,
          report_references_count: 0,
          created_at: proj.created_at,
        };
        setImported(synth);
        setForm(formFromInferred(inferred));
      })
      .catch((err) => toast.error("Could not load import: " + (err instanceof Error ? err.message : "?")))
      .finally(() => setLoading(false));
  }, [projectId]);

  /** Persist project+session updates from the confirm form.
   *  Returns true on success; the caller decides where to navigate. */
  const persistForm = async (): Promise<boolean> => {
    if (!form || !imported) return false;
    try {
      await api.projects.update(projectId, {
        name: form.name,
        audience: form.audience,
        deck_type: form.deck_type,
        engagement_type: form.engagement_template_id || "",
      });
      await api.sessions.updateStageData(imported.session_id, {
        central_question: form.central_question,
        desired_decision: form.desired_decision,
        audience: form.audience,
        deck_type: form.deck_type,
        hypothesis: form.hypothesis,
        output_language: form.output_language,
        mece_template: form.engagement_template_id || "generic",
      });
      try { sessionStorage.removeItem(`mckinsey-ppt:import:${projectId}`); } catch {}
      return true;
    } catch (err) {
      toast.error("Save failed: " + (err instanceof Error ? err.message : "?"));
      return false;
    }
  };

  /** McKinsey path: opens the chat workspace (Stage 3+4 → PPTX) */
  const handleConfirm = async () => {
    setSaving(true);
    const ok = await persistForm();
    if (ok) {
      toast.success("Engagement listo · abriendo workspace");
      router.push(`/v2/engagements/${projectId}`);
    } else {
      setSaving(false);
    }
  };

  /** DeepResearch path: skips the chat workspace, goes straight to the
   *  one-shot generation form + HTML viewer. */
  const handleDeepResearch = async () => {
    setSaving(true);
    const ok = await persistForm();
    if (ok) {
      toast.success("Engagement listo · abriendo DeepResearch deck");
      router.push(`/v2/engagements/${projectId}/deepresearch`);
    } else {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!confirm("Esto borra el proyecto importado. ¿Confirmás?")) return;
    setDiscarding(true);
    try {
      await api.projects.delete(projectId);
      try { sessionStorage.removeItem(`mckinsey-ppt:import:${projectId}`); } catch {}
      router.push("/v2");
    } catch (err) {
      toast.error("Delete failed: " + (err instanceof Error ? err.message : "?"));
      setDiscarding(false);
    }
  };

  const wordCount = useMemo(() => {
    return imported?.report_word_count ?? 0;
  }, [imported]);

  if (loading || !form || !imported) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ color: "var(--ink-3)" }}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span style={{ fontSize: 13 }}>Loading import…</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col">
      {/* Top bar */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{ padding: "12px 24px", borderColor: "var(--line)", background: "var(--paper)" }}
      >
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => router.push("/v2/import")}
            className="inline-flex items-center transition-opacity hover:opacity-70"
            style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}
          >
            <ArrowLeft className="h-[14px] w-[14px]" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
          </button>
          <Logo size={14} />
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span style={{ fontFamily: "var(--serif)", fontSize: 14 }}>Confirm imported metadata</span>
        </div>
        <div className="flex items-center gap-2">
          <Chip size="xs" tone="ghost">{wordCount.toLocaleString()} words</Chip>
          <Chip size="xs" tone="accent">{imported.branches_detected_count} branches detected</Chip>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 32px 80px" }}>
          <div className="v2-kicker mb-2">STEP 2 OF 2</div>
          <h1
            className="m-0"
            style={{
              fontFamily: "var(--serif)",
              fontSize: 36,
              letterSpacing: -0.7,
              lineHeight: 1.1,
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            Confirmá el contexto del deck
          </h1>
          <p className="mt-3" style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.55, maxWidth: 600 }}>
            Inferimos esto del informe con gemini-3.1-pro <Sparkles className="inline h-3 w-3" strokeWidth={1.5} />.
            Ajustá lo que haga falta y abrí el workspace para empezar a generar el deck.
          </p>

          {/* Form */}
          <div className="mt-8 grid gap-4">
            <Field label="Project name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={inputStyle}
              />
            </Field>

            <Field label="Central question" hint="Pregunta de decisión específica que el deck debe responder">
              <textarea
                value={form.central_question}
                onChange={(e) => setForm({ ...form, central_question: e.target.value })}
                rows={2}
                style={{ ...inputStyle, fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.4, resize: "vertical" }}
              />
            </Field>

            <Field label="Desired decision" hint="Decisión concreta que la audiencia debe tomar">
              <textarea
                value={form.desired_decision}
                onChange={(e) => setForm({ ...form, desired_decision: e.target.value })}
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Audience">
                <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} style={inputStyle}>
                  {AUDIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Deck type">
                <select value={form.deck_type} onChange={(e) => setForm({ ...form, deck_type: e.target.value })} style={inputStyle}>
                  {DECK_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Engagement template" hint="Afecta secciones, número de slides, terminología">
                <select
                  value={form.engagement_template_id}
                  onChange={(e) => setForm({ ...form, engagement_template_id: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">— Generic —</option>
                  {ENGAGEMENT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Output language">
                <select value={form.output_language} onChange={(e) => setForm({ ...form, output_language: e.target.value })} style={inputStyle}>
                  {LANGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Hypothesis (answer first)" hint="One-sentence governing thought que va a liderar el executive summary">
              <textarea
                value={form.hypothesis}
                onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>

            {/* Branches preview (collapsible) */}
            {imported.inferred.branches.length > 0 && (
              <div style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)" }}>
                <button
                  onClick={() => setShowBranches((v) => !v)}
                  className="w-full flex items-center justify-between transition-colors hover:bg-black/[.02]"
                  style={{
                    padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer",
                    fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-2)",
                  }}
                >
                  <span>
                    <ChevronRight
                      className="inline h-3.5 w-3.5 mr-1.5 transition-transform"
                      strokeWidth={1.5}
                      style={{ transform: showBranches ? "rotate(90deg)" : "none" }}
                    />
                    {imported.inferred.branches.length} branches detected from H2 sections
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                    Editables después en /structure
                  </span>
                </button>
                {showBranches && (
                  <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {imported.inferred.branches.map((b, i) => (
                      <div key={i} style={{ borderTop: "1px dashed var(--line)", paddingTop: 12 }}>
                        <div style={{
                          fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-3)",
                          letterSpacing: 1, marginBottom: 4,
                        }}>
                          BRANCH {String.fromCharCode(65 + i)}
                        </div>
                        <div style={{ fontFamily: "var(--serif)", fontSize: 15, color: "var(--ink)", lineHeight: 1.3 }}>
                          {b.question}
                        </div>
                        {b.evidence && (
                          <div className="mt-1" style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
                            {b.evidence.slice(0, 240)}{b.evidence.length > 240 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Deck style picker — explains the two output paths */}
          <div className="mt-8 mb-2" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: 1, textTransform: "uppercase", fontFamily: "var(--mono)" }}>
            Generate as
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={handleDiscard}
              disabled={discarding}
              className="inline-flex items-center gap-2 transition-opacity hover:opacity-70"
              style={{
                background: "transparent",
                color: "var(--danger)",
                border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)",
                borderRadius: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "var(--sans)",
                cursor: discarding ? "not-allowed" : "pointer",
              }}
            >
              {discarding ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : <Trash2 className="h-[13px] w-[13px]" strokeWidth={1.5} />}
              Discard import
            </button>

            <div className="flex gap-2.5 flex-wrap">
              {/* DeepResearch path — visual HTML slides with palette + image_provider */}
              <button
                onClick={handleDeepResearch}
                disabled={saving}
                title="Form-driven generation with palette themes, layouts variados, image fetching. HTML viewer + JSON / PPTX export."
                className="inline-flex items-center gap-2 transition-opacity hover:opacity-90"
                style={{
                  background: "var(--paper)",
                  color: "var(--ink)",
                  border: "1px solid var(--ink-2)",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 13.5,
                  fontWeight: 500,
                  fontFamily: "var(--sans)",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? <Loader2 className="h-[13px] w-[13px] animate-spin" /> : null}
                <span style={{ fontFamily: "var(--serif)", fontSize: 14 }}>DeepResearch</span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>· slides JSON + viewer</span>
                <ArrowRight className="h-[13px] w-[13px]" strokeWidth={1.5} />
              </button>

              {/* McKinsey path — the existing chat workspace → PPTX McKinsey-validated */}
              <button
                onClick={handleConfirm}
                disabled={saving}
                title="Workspace con chat: Stage 3 (storyline + slides) + Stage 4 (refine) → PPTX McKinsey-validated (action titles, charts, validators)."
                className="inline-flex items-center gap-2 transition-opacity hover:opacity-90"
                style={{
                  background: "var(--ink)",
                  color: "var(--paper)",
                  border: "1px solid var(--ink)",
                  borderRadius: 6,
                  padding: "10px 18px",
                  fontSize: 13.5,
                  fontWeight: 500,
                  fontFamily: "var(--sans)",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : null}
                <span style={{ fontFamily: "var(--serif)", fontSize: 14 }}>McKinsey deck</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>· chat + PPTX</span>
                <ArrowRight className="h-[14px] w-[14px]" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formFromInferred(inferred: InferredMetadata): FormState {
  return {
    name: inferred.title || "Untitled engagement",
    central_question: inferred.central_question || "",
    desired_decision: inferred.desired_decision || "",
    audience: inferred.audience || "client",
    deck_type: inferred.deck_type || "strategic",
    engagement_template_id: inferred.engagement_template_id || "",
    hypothesis: inferred.hypothesis || "",
    output_language: inferred.output_language || "en",
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div className="mb-1.5" style={{
        fontFamily: "var(--mono)", fontSize: 9, letterSpacing: 1.3,
        color: "var(--ink-3)", textTransform: "uppercase",
      }}>
        {label}
      </div>
      {children}
      {hint && (
        <div className="mt-1" style={{ fontSize: 11, color: "var(--ink-4)" }}>{hint}</div>
      )}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--line-2)",
  borderRadius: 6,
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--sans)",
  fontSize: 13.5,
  outline: "none",
};

