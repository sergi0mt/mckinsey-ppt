"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Project, ValidationReport, Deliverable } from "@/lib/types";
import { Chip, Divider, Logo } from "@/lib/v2/primitives";

// ────────────────────────────────────────────────────────────────
// Format options — map UI to backend format_type
// ────────────────────────────────────────────────────────────────

type FormatOption = {
  /** Backend format_type sent in the export request. */
  formatType: "pptx" | "docx" | "pdf_onepager" | "markdown" | "transcript";
  /** Display extension. */
  ext: string;
  title: string;
  desc: string;
  primary?: boolean;
  beta?: boolean;
  options: string[];
};

const FORMATS: FormatOption[] = [
  {
    formatType: "pptx",
    ext: ".pptx",
    title: "PowerPoint",
    desc: "Native shapes, editable charts where possible. Fonts: Arial. McKinsey master template applied.",
    primary: true,
    options: ["Editable charts", "Image charts (matplotlib)", "Both"],
  },
  {
    formatType: "docx",
    ext: ".docx",
    title: "Executive memo",
    desc: "Word document with SCR framework, exhibits, and recommendation box. Arial + navy palette.",
    options: ["With chart exhibits", "Text only"],
  },
  {
    formatType: "pdf_onepager",
    ext: ".pdf",
    title: "One-pager",
    desc: "Single-page PDF for board pre-read. Top action title + key chart + recommendation strip.",
    options: ["Letter", "A4"],
  },
  {
    formatType: "markdown",
    ext: ".md",
    title: "Markdown",
    desc: "Full storyline with action titles, bullets, citations and sources. Good for handoff or AI re-prompting.",
    options: ["With chart data tables", "Action titles only"],
  },
];

// ────────────────────────────────────────────────────────────────
// Export center
// ────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      api.projects.get(projectId),
      api.validation.validate(projectId).catch(() => null),
      api.exports.list(projectId).catch(() => [] as Deliverable[]),
    ])
      .then(([proj, val, dlv]) => {
        setProject(proj);
        setValidation(val);
        setDeliverables(dlv ?? []);
      })
      .catch((err) => toast.error("Failed to load export center: " + err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleGenerate(format: FormatOption) {
    setGenerating((prev) => ({ ...prev, [format.formatType]: true }));
    try {
      const result = await api.exports.generate(projectId, format.formatType);
      // Refresh deliverables
      const dlv = await api.exports.list(projectId);
      setDeliverables(dlv);
      toast.success(`Generated ${format.title} (${format.ext})`);
      // Trigger download immediately
      const url = api.exports.downloadUrl(result.id);
      window.open(url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    }
    setGenerating((prev) => ({ ...prev, [format.formatType]: false }));
  }

  const score = validation?.score ?? 0;
  const validationPassed = score >= 80;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{ padding: "12px 24px", borderColor: "var(--line)", background: "var(--paper)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/v2/engagements/${projectId}`)}
            className="v2-ghost-btn"
          >
            <ArrowLeft className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Workspace
          </button>
          <Logo size={14} />
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span style={{ fontSize: 13 }}>Export · {project?.name ?? "Engagement"}</span>
        </div>
        {validation && (
          <Chip tone={validationPassed ? "success" : "warn"}>
            Validation {validationPassed ? "passed" : "needs work"} · {score}/100
          </Chip>
        )}
      </header>

      <div className="flex-1 overflow-auto" style={{ padding: "44px 56px" }}>
        <div className="v2-kicker mb-1.5" style={{ fontSize: 11 }}>
          Stage 04 · Generate
        </div>
        <h1 className="v2-h1 m-0 mb-7">Where do you want to send this?</h1>

        {loading ? (
          <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span style={{ fontSize: 13 }}>Loading export center…</span>
          </div>
        ) : (
          <>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(2, 1fr)", maxWidth: 920 }}
            >
              {FORMATS.map((f) => (
                <div
                  key={f.formatType}
                  style={{
                    padding: "20px 22px",
                    background: "var(--paper)",
                    border: "1px solid " + (f.primary ? "var(--ink)" : "var(--line)"),
                    borderRadius: 10,
                  }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        letterSpacing: 1.2,
                        color: "var(--ink-3)",
                      }}
                    >
                      {f.ext.toUpperCase()}
                    </span>
                    {f.primary && (
                      <Chip size="xs" tone="accent">
                        primary
                      </Chip>
                    )}
                    {f.beta && (
                      <Chip size="xs" tone="ghost">
                        beta
                      </Chip>
                    )}
                  </div>
                  <div
                    className="mb-1.5"
                    style={{
                      fontFamily: "var(--serif)",
                      fontSize: 22,
                      letterSpacing: -0.4,
                    }}
                  >
                    {f.title}
                  </div>
                  <div
                    className="mb-3.5"
                    style={{
                      fontSize: 12.5,
                      color: "var(--ink-3)",
                      lineHeight: 1.5,
                    }}
                  >
                    {f.desc}
                  </div>
                  <div className="mb-3.5 flex flex-wrap gap-1">
                    {f.options.map((opt, i) => (
                      <Chip key={i} tone={i === 0 ? "accent" : "ghost"}>
                        {opt}
                      </Chip>
                    ))}
                  </div>
                  <button
                    onClick={() => handleGenerate(f)}
                    disabled={generating[f.formatType]}
                    className={f.primary ? "v2-default-btn" : "v2-outline-btn"}
                  >
                    {generating[f.formatType] ? (
                      <Loader2 className="h-[13px] w-[13px] animate-spin" />
                    ) : (
                      <Download className="h-[13px] w-[13px]" strokeWidth={1.5} />
                    )}
                    Generate {f.ext}
                  </button>
                </div>
              ))}
            </div>

            {/* ── Scope strip ──────────────────────────────── */}
            <div style={{ maxWidth: 920 }}>
              <Divider label="scope" className="my-9" />
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <ScopeCell
                  label="Slides"
                  value={`${project?.slide_count ?? 0} slides`}
                  sub="Body + appendix"
                />
                <ScopeCell label="Language" value="English" sub="Auto-detected" />
                <ScopeCell label="Tone" value="Executive" sub="Adjustable in Briefing" />
              </div>
            </div>

            {/* ── Recently generated ───────────────────────── */}
            {deliverables.length > 0 && (
              <div style={{ maxWidth: 920 }}>
                <Divider label="recently generated" className="mb-3.5 mt-9" />
                <div className="flex flex-col gap-2">
                  {deliverables.slice(0, 8).map((d) => (
                    <a
                      key={d.id}
                      href={api.exports.downloadUrl(d.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 transition-colors hover:bg-black/[.02]"
                      style={{
                        padding: "10px 14px",
                        background: "var(--paper)",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        textDecoration: "none",
                        color: "var(--ink)",
                      }}
                    >
                      <Chip size="xs" tone="ghost">
                        {d.format_type}
                      </Chip>
                      <span style={{ fontSize: 13, color: "var(--ink)" }}>{d.filename}</span>
                      <div className="flex-1" />
                      <Download
                        className="h-[13px] w-[13px]"
                        strokeWidth={1.5}
                        style={{ color: "var(--ink-3)" }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        :global(.v2-theme .v2-ghost-btn) {
          background: transparent; color: var(--ink-2); border: 1px solid transparent;
          border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 500;
          font-family: var(--sans); cursor: pointer; transition: opacity 0.15s ease;
          display: inline-flex; align-items: center; gap: 6px;
        }
        :global(.v2-theme .v2-ghost-btn:hover) { opacity: 0.7; }
        :global(.v2-theme .v2-outline-btn) {
          background: transparent; color: var(--ink); border: 1px solid var(--line-2);
          border-radius: 6px; padding: 6px 12px; font-size: 13px; font-weight: 500;
          font-family: var(--sans); cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
        }
        :global(.v2-theme .v2-outline-btn:disabled) { opacity: 0.5; cursor: not-allowed; }
        :global(.v2-theme .v2-default-btn) {
          background: var(--ink); color: var(--paper); border: 1px solid var(--ink);
          border-radius: 6px; padding: 6px 12px; font-size: 13px; font-weight: 500;
          font-family: var(--sans); cursor: pointer; transition: opacity 0.15s ease;
          display: inline-flex; align-items: center; gap: 6px;
        }
        :global(.v2-theme .v2-default-btn:hover) { opacity: 0.9; }
        :global(.v2-theme .v2-default-btn:disabled) { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Scope cell
// ────────────────────────────────────────────────────────────────

function ScopeCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: 1.2,
          color: "var(--ink-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div className="mt-0.5" style={{ fontSize: 13, fontWeight: 500 }}>
        {value}
      </div>
      <div className="mt-0.5" style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {sub}
      </div>
    </div>
  );
}
