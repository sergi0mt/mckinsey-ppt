"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Sparkles, Check, Edit3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ValidationReport, ValidationIssue } from "@/lib/types";
import { Chip, Divider, Dot, Logo } from "@/lib/v2/primitives";

// ────────────────────────────────────────────────────────────────
// Types — group raw validator output into UI rubric dimensions
// ────────────────────────────────────────────────────────────────

type RubricDimension = {
  name: string;
  score: number;
  weight: number;
  msg: string;
  status: "pass" | "warn" | "fail";
  issues: { slide: number | null; text: string }[];
};

const RUBRIC_DIMENSIONS = [
  { key: "ACTION_TITLE", name: "Action titles", weight: 25 },
  { key: "MECE", name: "MECE integrity", weight: 15 },
  { key: "CHART", name: "So-what annotations", weight: 15 },
  { key: "STRUCTURE", name: "Structure", weight: 15 },
  { key: "CITATION", name: "Citations", weight: 15 },
  { key: "BULLET", name: "Bullet density", weight: 10 },
  { key: "TITLE_LEN", name: "Title length", weight: 5 },
];

// ────────────────────────────────────────────────────────────────
// Validation page
// ────────────────────────────────────────────────────────────────

export default function ValidationPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [fixingKey, setFixingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    runValidation();
  }, [projectId]);

  async function runValidation() {
    setRunning(true);
    try {
      const r = await api.validation.validate(projectId);
      setReport(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
    }
    setRunning(false);
    setLoading(false);
  }

  /**
   * Auto-fix — synthesize a refine prompt from the issue, send it via the chat
   * session (drains SSE), then re-validate so the issue list refreshes. The
   * orchestrator handles slide updates server-side.
   */
  async function handleAutoFix(issue: ValidationIssue, key: string) {
    setFixingKey(key);
    try {
      const session = await api.sessions.getOrCreate(projectId);
      const slideRef =
        issue.slide_index != null ? `slide ${issue.slide_index}` : "the affected slide(s)";
      const prompt = [
        `Apply auto-fix to ${slideRef}.`,
        `Rule: ${issue.rule}`,
        `Issue: ${issue.message}`,
        issue.suggestion ? `Suggestion: ${issue.suggestion}` : "",
        "Output the corrected slide as JSON, preserving the slide_type and position.",
      ]
        .filter(Boolean)
        .join("\n");

      const response = await api.sessions.sendMessage(session.id, prompt, {
        use_web_search: false,
        research_depth: "standard",
        auto_refine: false,
      });
      if (response.body) {
        const reader = response.body.getReader();
        // Drain to completion — the orchestrator persists slide changes during the stream
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      toast.success("Auto-fix applied · re-validating");
      await runValidation();
    } catch (err) {
      toast.error("Auto-fix failed: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setFixingKey(null);
    }
  }

  const dimensions = buildRubricDimensions(report);
  const totalIssues =
    (report?.errors?.length ?? 0) + (report?.warnings?.length ?? 0);
  const score = report?.score ?? 0;

  const scoreLabel =
    score >= 90 ? "Partner-ready" : score >= 80 ? "Board-ready" : score >= 60 ? "Needs work" : "Draft";
  const scoreTone: "success" | "accent" | "warn" =
    score >= 90 ? "success" : score >= 80 ? "accent" : "warn";

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{ padding: "14px 24px", borderColor: "var(--line)", background: "var(--paper)" }}
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
          <span style={{ fontSize: 13 }}>Validation</span>
        </div>
        <div className="flex gap-1.5">
          <button
            className="v2-outline-btn"
            onClick={() => toast("Coming soon — PDF report")}
          >
            <Download className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Report (PDF)
          </button>
          <button
            onClick={runValidation}
            disabled={running}
            className="v2-default-btn"
          >
            {running ? (
              <Loader2 className="h-[13px] w-[13px] animate-spin" />
            ) : (
              <Sparkles className="h-[13px] w-[13px]" strokeWidth={1.5} />
            )}
            Re-validate
          </button>
        </div>
      </header>

      {/* ── 2-column: score breakdown + issue list ─────── */}
      <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: "360px 1fr", minHeight: 0 }}>
        {/* ── Left: score summary ──────────────────────── */}
        <div
          className="overflow-auto border-r"
          style={{ padding: "40px 32px", borderColor: "var(--line)", background: "var(--paper)" }}
        >
          <div className="v2-kicker" style={{ fontSize: 11 }}>
            McKinsey adherence
          </div>
          <div
            className="m-0 mt-3"
            style={{
              fontFamily: "var(--serif)",
              fontSize: 96,
              lineHeight: 1,
              letterSpacing: -3,
              fontWeight: 400,
            }}
          >
            {loading ? "—" : score}
            <span style={{ fontSize: 36, color: "var(--ink-3)" }}> / 100</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Chip tone={scoreTone}>
              <Dot color="currentColor" />
              {scoreLabel}
            </Chip>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {totalIssues > 0
                ? `${totalIssues} ${totalIssues === 1 ? "issue" : "issues"} to review`
                : "No issues"}
            </span>
          </div>

          <Divider label="breakdown" className="my-7" />

          <div className="flex flex-col gap-4">
            {dimensions.map((v, i) => (
              <div key={i}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{v.name}</span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 13,
                      color:
                        v.status === "pass"
                          ? "var(--success)"
                          : v.status === "warn"
                            ? "var(--warn)"
                            : "var(--danger)",
                    }}
                  >
                    {v.score}
                  </span>
                </div>
                <div
                  className="overflow-hidden"
                  style={{ height: 3, background: "var(--line)", borderRadius: 2 }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${v.score}%`,
                      background:
                        v.status === "pass"
                          ? "var(--success)"
                          : v.status === "warn"
                            ? "var(--warn)"
                            : "var(--danger)",
                    }}
                  />
                </div>
                <div
                  className="mt-1.5"
                  style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}
                >
                  {v.msg}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: issue list ───────────────────────── */}
        <div className="overflow-auto" style={{ padding: "40px 48px" }}>
          {loading ? (
            <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span style={{ fontSize: 13 }}>Running validators…</span>
            </div>
          ) : (
            <>
              <div className="v2-kicker mb-2" style={{ fontSize: 11 }}>
                {report?.errors && report.errors.length > 0
                  ? `ERRORS · ${report.errors.length}`
                  : `WARNINGS · ${report?.warnings?.length ?? 0}`}
              </div>
              <h2
                className="m-0 mb-7"
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 32,
                  letterSpacing: -0.6,
                  fontWeight: 400,
                  lineHeight: 1.15,
                }}
              >
                {totalIssues === 0
                  ? "Clean rubric — partner-review ready."
                  : `${totalIssues} fix${totalIssues === 1 ? "" : "es"} stand between you and a partner-review-ready deck.`}
              </h2>

              {/* Errors first, then warnings */}
              <div className="flex flex-col gap-3">
                {(report?.errors ?? []).map((iss, i) => {
                  const key = `e-${i}`;
                  return (
                    <IssueCard
                      key={key}
                      issue={iss}
                      severity="error"
                      projectId={projectId}
                      fixing={fixingKey === key}
                      busy={fixingKey !== null}
                      onAutoFix={() => handleAutoFix(iss, key)}
                    />
                  );
                })}
                {(report?.warnings ?? []).map((iss, i) => {
                  const key = `w-${i}`;
                  return (
                    <IssueCard
                      key={key}
                      issue={iss}
                      severity="warn"
                      projectId={projectId}
                      fixing={fixingKey === key}
                      busy={fixingKey !== null}
                      onAutoFix={() => handleAutoFix(iss, key)}
                    />
                  );
                })}
              </div>

              {/* Passed checks */}
              {dimensions.some((d) => d.status === "pass") && (
                <>
                  <Divider label="passed checks" className="my-10" />
                  <div className="grid grid-cols-2 gap-2.5">
                    {dimensions
                      .filter((v) => v.status === "pass")
                      .map((v, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5"
                          style={{
                            padding: "10px 14px",
                            border: "1px solid var(--line)",
                            borderRadius: 6,
                            background: "var(--paper)",
                          }}
                        >
                          <Check
                            className="h-[14px] w-[14px]"
                            strokeWidth={2.5}
                            style={{ color: "var(--success)" }}
                          />
                          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                            {v.name}
                          </span>
                          <div className="flex-1" />
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 11,
                              color: "var(--success)",
                            }}
                          >
                            {v.score}
                          </span>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
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
          border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 500;
          font-family: var(--sans); cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
        }
        :global(.v2-theme .v2-default-btn) {
          background: var(--ink); color: var(--paper); border: 1px solid var(--ink);
          border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 500;
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
// Issue card
// ────────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  severity,
  projectId,
  fixing,
  busy,
  onAutoFix,
}: {
  issue: ValidationIssue;
  severity: "error" | "warn";
  projectId: string;
  fixing: boolean;
  busy: boolean;
  onAutoFix: () => void;
}) {
  const router = useRouter();
  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "16px 20px",
        opacity: busy && !fixing ? 0.6 : 1,
      }}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <Chip size="xs" tone={severity === "error" ? "danger" : "warn"}>
          {issue.rule}
        </Chip>
        {issue.slide_index != null && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--ink-3)",
            }}
          >
            SLIDE {String(issue.slide_index).padStart(2, "0")}
          </span>
        )}
      </div>
      <div
        className="mb-3"
        style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}
      >
        {issue.message}
      </div>
      {issue.suggestion && (
        <div
          className="mb-3 italic"
          style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.4 }}
        >
          → {issue.suggestion}
        </div>
      )}
      <div className="flex gap-1.5">
        <button onClick={onAutoFix} disabled={busy} className="v2-default-btn">
          {fixing ? (
            <Loader2 className="h-[13px] w-[13px] animate-spin" strokeWidth={1.5} />
          ) : (
            <Sparkles className="h-[13px] w-[13px]" strokeWidth={1.5} />
          )}
          {fixing ? "Fixing…" : "Auto-fix"}
        </button>
        {issue.slide_index != null && (
          <button
            onClick={() =>
              router.push(`/v2/engagements/${projectId}`)
            }
            disabled={busy}
            className="v2-outline-btn"
          >
            <Edit3 className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Open slide {issue.slide_index}
          </button>
        )}
        <button disabled={busy} className="v2-ghost-btn">Ignore</button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Build rubric dimensions from raw validator output
// ────────────────────────────────────────────────────────────────

function buildRubricDimensions(report: ValidationReport | null): RubricDimension[] {
  if (!report) return [];
  return RUBRIC_DIMENSIONS.map((d) => {
    // Match issues whose rule starts with the dimension key
    const matchingErrors = (report.errors ?? []).filter((e) =>
      e.rule.toUpperCase().startsWith(d.key),
    );
    const matchingWarnings = (report.warnings ?? []).filter((w) =>
      w.rule.toUpperCase().startsWith(d.key),
    );
    const issueCount = matchingErrors.length + matchingWarnings.length;
    // Heuristic score: 100 if no issues, 100 - 5 per warning, 100 - 15 per error
    const dimScore = Math.max(
      0,
      100 - matchingWarnings.length * 5 - matchingErrors.length * 15,
    );
    const status: "pass" | "warn" | "fail" =
      matchingErrors.length > 0 ? "fail" : matchingWarnings.length > 0 ? "warn" : "pass";

    let msg: string;
    if (issueCount === 0) msg = `All ${d.name.toLowerCase()} checks pass.`;
    else if (status === "fail") msg = `${matchingErrors.length} blocker${matchingErrors.length === 1 ? "" : "s"} on ${d.name.toLowerCase()}.`;
    else msg = `${matchingWarnings.length} warning${matchingWarnings.length === 1 ? "" : "s"} on ${d.name.toLowerCase()}.`;

    return {
      name: d.name,
      score: dimScore,
      weight: d.weight,
      msg,
      status,
      issues: [...matchingErrors, ...matchingWarnings].map((i: ValidationIssue) => ({
        slide: i.slide_index,
        text: i.message,
      })),
    };
  });
}
