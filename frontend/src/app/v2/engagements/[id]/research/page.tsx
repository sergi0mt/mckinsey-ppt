"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Loader2, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ResearchState, ResearchStep, ResearchSource } from "@/lib/types";
import { Chip, Dot, Logo, TierBadge } from "@/lib/v2/primitives";

// ────────────────────────────────────────────────────────────────
// Helpers — derive tier (1/2/3) from quality_score
// ────────────────────────────────────────────────────────────────

function tierFromScore(score: number): 1 | 2 | 3 {
  if (score >= 0.85) return 1;
  if (score >= 0.65) return 2;
  return 3;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ────────────────────────────────────────────────────────────────
// Research log page
// ────────────────────────────────────────────────────────────────

export default function ResearchLogPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [state, setState] = useState<ResearchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customSubQ, setCustomSubQ] = useState("");
  const [customBranch, setCustomBranch] = useState("");
  const [customQueries, setCustomQueries] = useState("");
  const [savingCustom, setSavingCustom] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    refresh();
  }, [projectId]);

  async function refresh() {
    try {
      const r = await api.research.get(projectId);
      setState(r);
    } catch (err) {
      toast.error("Failed to load research: " + (err instanceof Error ? err.message : "?"));
    }
    setLoading(false);
  }

  async function handleGeneratePlan() {
    setPlanning(true);
    try {
      await api.research.generatePlan(projectId);
      await refresh();
      toast.success("Research plan generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Plan failed");
    }
    setPlanning(false);
  }

  /**
   * Append a user-defined query to the existing research plan and persist.
   * Keeps the plan additive — no replace, no reorder.
   */
  async function handleAddCustomQuery() {
    if (!customSubQ.trim()) {
      toast.error("Enter a sub-question");
      return;
    }
    setSavingCustom(true);
    try {
      const queries = customQueries
        .split(/\n+/)
        .map((q) => q.trim())
        .filter(Boolean);
      const baseSteps: ResearchStep[] = state?.research_plan?.research_plan ?? [];
      const nextId = baseSteps.reduce((m, s) => Math.max(m, s.id ?? 0), 0) + 1;
      const newStep: ResearchStep = {
        id: nextId,
        sub_question: customSubQ.trim(),
        branch: (customBranch.trim() || "Custom").slice(0, 24),
        search_queries: queries.length > 0 ? queries : [customSubQ.trim()],
        data_type: "qualitative",
        priority: "medium",
      };
      const newPlan = {
        ...(state?.research_plan ?? {}),
        research_plan: [...baseSteps, newStep],
      };
      await api.research.updatePlan(projectId, newPlan);
      toast.success("Custom query added");
      setCustomDialogOpen(false);
      setCustomSubQ("");
      setCustomBranch("");
      setCustomQueries("");
      await refresh();
    } catch (err) {
      toast.error("Failed to add: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setSavingCustom(false);
    }
  }

  async function handleRunResearch() {
    setExecuting(true);
    try {
      const response = await api.research.execute(projectId);
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      await refresh();
      toast.success("Research executed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Execution failed");
    }
    setExecuting(false);
  }

  // Derive stats
  const plan = state?.research_plan?.research_plan ?? [];
  const sources = state?.sources ?? [];
  const t1 = sources.filter((s) => tierFromScore(s.quality_score) === 1).length;
  const t2 = sources.filter((s) => tierFromScore(s.quality_score) === 2).length;
  const t3 = sources.filter((s) => tierFromScore(s.quality_score) === 3).length;
  const deepFetched = sources.filter((s) => !!s.deep_content).length;
  const queryCount = plan.reduce((acc, p) => acc + (p.search_queries?.length ?? 0), 0);

  const status = state?.status ?? "pending";
  const statusLabel = status === "complete" ? "Research complete" : status === "in_progress" ? "Running" : "Not started";
  const statusTone: "success" | "accent" | "ghost" = status === "complete" ? "success" : status === "in_progress" ? "accent" : "ghost";

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
          <span style={{ fontSize: 13 }}>Research log</span>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={statusTone}>
            <Dot color="currentColor" />
            {statusLabel}
          </Chip>
          {plan.length === 0 ? (
            <button onClick={handleGeneratePlan} disabled={planning} className="v2-default-btn">
              {planning ? (
                <Loader2 className="h-[13px] w-[13px] animate-spin" />
              ) : (
                <Sparkles className="h-[13px] w-[13px]" strokeWidth={1.5} />
              )}
              Generate plan
            </button>
          ) : (
            <button onClick={handleRunResearch} disabled={executing} className="v2-default-btn">
              {executing ? (
                <Loader2 className="h-[13px] w-[13px] animate-spin" />
              ) : (
                <Play className="h-[13px] w-[13px]" strokeWidth={1.5} />
              )}
              Run research
            </button>
          )}
          <button
            className="v2-outline-btn"
            onClick={() => setCustomDialogOpen(true)}
            disabled={planning || executing}
          >
            <Plus className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Add custom query
          </button>
        </div>
      </header>

      {/* ── Stats bar ───────────────────────────────────── */}
      <div
        className="grid border-b"
        style={{
          gridTemplateColumns: "repeat(5, 1fr)",
          borderColor: "var(--line)",
          background: "var(--paper)",
        }}
      >
        {[
          { l: "Queries", v: queryCount, sub: `across ${plan.length} sub-question${plan.length === 1 ? "" : "s"}` },
          { l: "Sources fetched", v: sources.length, sub: `${t1} Tier-1 · ${t2} T-2 · ${t3} T-3` },
          { l: "Deep-fetched", v: deepFetched, sub: "full text on Tier 1-2" },
          { l: "Data gaps", v: state?.data_gaps?.length ?? 0, sub: "areas needing more sources" },
          { l: "Status", v: statusLabel, sub: status === "complete" ? "ready to brief" : "pending" },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              padding: "16px 20px",
              borderRight: i < 4 ? "1px solid var(--line)" : "none",
            }}
          >
            <div className="v2-kicker" style={{ fontSize: 10, letterSpacing: 1.2 }}>
              {s.l}
            </div>
            <div
              className="mt-1"
              style={{
                fontFamily: "var(--serif)",
                fontSize: 26,
                letterSpacing: -0.5,
                lineHeight: 1.1,
              }}
            >
              {s.v}
            </div>
            <div className="mt-0.5" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center" style={{ color: "var(--ink-3)" }}>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span style={{ fontSize: 13 }}>Loading research…</span>
        </div>
      ) : (
        <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
          {/* ── Left: query timeline ────────────────────── */}
          <div className="overflow-auto border-r" style={{ borderColor: "var(--line)", padding: "24px 28px" }}>
            <div className="v2-kicker mb-2" style={{ fontSize: 10, letterSpacing: 1.5 }}>
              QUERY PIPELINE
            </div>
            <h2
              className="m-0 mb-5"
              style={{
                fontFamily: "var(--serif)",
                fontSize: 24,
                letterSpacing: -0.4,
                fontWeight: 400,
              }}
            >
              Multi-query search · plan → step → synthesize
            </h2>

            {plan.length === 0 ? (
              <div
                className="text-center"
                style={{
                  padding: "32px",
                  border: "1px dashed var(--line-2)",
                  borderRadius: 8,
                  background: "var(--paper)",
                  color: "var(--ink-3)",
                  fontSize: 13,
                }}
              >
                No research plan yet. Click <strong>&ldquo;Generate plan&rdquo;</strong> to seed sub-questions from the engagement template.
              </div>
            ) : (
              plan.map((p, i) => (
                <QueryItem
                  key={p.id ?? i}
                  step={p}
                  isLast={i === plan.length - 1}
                  status={status === "complete" ? "done" : i === 0 ? "running" : "queued"}
                  resultCount={
                    sources.filter((s) =>
                      p.search_queries?.some((q) =>
                        s.snippet?.toLowerCase().includes(q.toLowerCase().slice(0, 12)),
                      ),
                    ).length
                  }
                />
              ))
            )}
          </div>

          {/* ── Right: source list ──────────────────────── */}
          <div className="overflow-auto" style={{ padding: "24px 28px" }}>
            <div className="v2-kicker mb-2" style={{ fontSize: 10, letterSpacing: 1.5 }}>
              SOURCES · {sources.length} · RANKED BY QUALITY
            </div>
            <h2
              className="m-0 mb-5"
              style={{
                fontFamily: "var(--serif)",
                fontSize: 24,
                letterSpacing: -0.4,
                fontWeight: 400,
              }}
            >
              What the AI is reading.
            </h2>

            {sources.length === 0 ? (
              <div
                className="text-center"
                style={{
                  padding: "32px",
                  border: "1px dashed var(--line-2)",
                  borderRadius: 8,
                  background: "var(--paper)",
                  color: "var(--ink-3)",
                  fontSize: 13,
                }}
              >
                Sources will appear here after the research executes.
              </div>
            ) : (
              [...sources]
                .sort((a, b) => b.quality_score - a.quality_score)
                .map((s, i) => (
                  <SourceItem key={i} source={s} index={i + 1} />
                ))
            )}
          </div>
        </div>
      )}

      {/* Custom query dialog */}
      {customDialogOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(26, 24, 20, 0.30)" }}
            onClick={() => !savingCustom && setCustomDialogOpen(false)}
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
                maxWidth: 460,
                background: "var(--paper)",
                border: "1px solid var(--line-2)",
                borderRadius: 10,
              }}
            >
              <div
                className="flex shrink-0 items-center gap-2.5 border-b"
                style={{ padding: "14px 20px", borderColor: "var(--line)" }}
              >
                <span className="v2-kicker" style={{ fontSize: 11, letterSpacing: 1 }}>
                  Add custom query
                </span>
              </div>
              <div className="flex flex-col gap-3" style={{ padding: "16px 20px" }}>
                <label className="flex flex-col gap-1">
                  <span
                    className="v2-kicker"
                    style={{ fontSize: 10, letterSpacing: 1.3 }}
                  >
                    Sub-question
                  </span>
                  <input
                    value={customSubQ}
                    onChange={(e) => setCustomSubQ(e.target.value)}
                    placeholder="e.g., What is the total addressable market in 2025?"
                    style={{
                      fontSize: 13,
                      padding: "8px 10px",
                      border: "1px solid var(--line-2)",
                      borderRadius: 6,
                      background: "var(--bg)",
                      color: "var(--ink)",
                      fontFamily: "var(--sans)",
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="v2-kicker"
                    style={{ fontSize: 10, letterSpacing: 1.3 }}
                  >
                    Branch (optional)
                  </span>
                  <input
                    value={customBranch}
                    onChange={(e) => setCustomBranch(e.target.value)}
                    placeholder='e.g., "A — Market" or just "Custom"'
                    style={{
                      fontSize: 13,
                      padding: "8px 10px",
                      border: "1px solid var(--line-2)",
                      borderRadius: 6,
                      background: "var(--bg)",
                      color: "var(--ink)",
                      fontFamily: "var(--sans)",
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="v2-kicker"
                    style={{ fontSize: 10, letterSpacing: 1.3 }}
                  >
                    Search queries (one per line, optional)
                  </span>
                  <textarea
                    value={customQueries}
                    onChange={(e) => setCustomQueries(e.target.value)}
                    placeholder={"market size 2025 in latam\ncagr forecast\ncompetitive landscape"}
                    rows={4}
                    style={{
                      fontSize: 12.5,
                      padding: "8px 10px",
                      border: "1px solid var(--line-2)",
                      borderRadius: 6,
                      background: "var(--bg)",
                      color: "var(--ink)",
                      fontFamily: "var(--mono)",
                      resize: "vertical",
                      lineHeight: 1.45,
                    }}
                  />
                </label>
                <p
                  className="m-0"
                  style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}
                >
                  Leave queries empty to fall back to the sub-question itself. The new step is
                  appended to the existing plan and will run on the next research execution.
                </p>
              </div>
              <div
                className="flex shrink-0 justify-end gap-1.5 border-t"
                style={{ padding: "12px 20px", borderColor: "var(--line)" }}
              >
                <button
                  onClick={() => setCustomDialogOpen(false)}
                  disabled={savingCustom}
                  className="v2-ghost-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomQuery}
                  disabled={savingCustom || !customSubQ.trim()}
                  className="v2-default-btn"
                >
                  {savingCustom ? (
                    <Loader2 className="h-[13px] w-[13px] animate-spin" />
                  ) : (
                    <Plus className="h-[13px] w-[13px]" strokeWidth={1.5} />
                  )}
                  Add to plan
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
// QueryItem — single step in the timeline
// ────────────────────────────────────────────────────────────────

function QueryItem({
  step,
  isLast,
  status,
  resultCount,
}: {
  step: ResearchStep;
  isLast: boolean;
  status: "done" | "running" | "queued";
  resultCount: number;
}) {
  const dotColor =
    status === "done" ? "var(--success)" : status === "running" ? "var(--accent)" : "var(--line-2)";

  return (
    <div className="relative" style={{ paddingLeft: 22, paddingBottom: 18 }}>
      <div
        style={{
          position: "absolute",
          left: 5,
          top: 6,
          bottom: isLast ? 6 : 0,
          width: 1,
          background: "var(--line)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 4,
          width: 11,
          height: 11,
          borderRadius: 999,
          background: dotColor,
          border: "2px solid var(--paper)",
        }}
      />
      <div
        style={{
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "10px 14px",
        }}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <Chip size="xs" tone="accent">
            {step.branch || "BRANCH"}
          </Chip>
          {status === "running" && (
            <Chip size="xs" tone="accent">
              <Dot color="var(--accent)" />
              running
            </Chip>
          )}
          {status === "queued" && (
            <Chip size="xs" tone="ghost">
              queued
            </Chip>
          )}
          <Chip size="xs" tone="ghost">
            {step.priority}
          </Chip>
        </div>
        <div className="mb-1.5" style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.35 }}>
          &ldquo;{step.sub_question}&rdquo;
        </div>
        <div
          className="flex gap-2.5"
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            fontFamily: "var(--mono)",
          }}
        >
          <span>{step.search_queries?.length ?? 0} queries</span>
          <span>{resultCount} results</span>
          <span>· {step.data_type}</span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SourceItem — single source card
// ────────────────────────────────────────────────────────────────

function SourceItem({ source, index }: { source: ResearchSource; index: number }) {
  const tier = tierFromScore(source.quality_score);
  const host = hostFromUrl(source.url);
  return (
    <div
      className="mb-2 flex gap-3"
      style={{
        padding: "12px 14px",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 6,
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--accent)",
          fontWeight: 600,
          minWidth: 32,
        }}
      >
        [N{index}]
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="mb-1"
          style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.3 }}
        >
          {source.title || host}
        </div>
        <div className="flex items-center gap-2">
          <TierBadge tier={tier} />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--ink-4)",
            }}
          >
            {host}
          </span>
          {source.deep_content && (
            <Chip size="xs" tone="success">
              deep-fetched
            </Chip>
          )}
        </div>
      </div>
    </div>
  );
}
