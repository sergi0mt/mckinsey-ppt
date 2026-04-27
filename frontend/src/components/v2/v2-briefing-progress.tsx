/**
 * V2BriefingProgress — autonomous "Brief Me" pipeline modal for the V2 Workspace.
 *
 * Triggered by the "Brief Me" button in the V2 Workspace header. Renders a centered
 * overlay (backdrop + paper card) with a progress bar and per-step indicators while
 * the backend pipeline runs:
 *   plan → research → synthesize → mece → storyline → save
 *
 * Mirrors the V1 component's polling-based protocol: POST /briefing/projects/{id}/start
 * launches a background task, then GET /briefing/projects/{id}/status polls progress
 * every 3s up to 6 minutes. On completion, calls onComplete() so the parent can
 * refresh slides + session.
 */
"use client";

import { useCallback, useState } from "react";
import {
  Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Search, Brain, Layers, FileText, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Chip, Dot } from "@/lib/v2/primitives";

const STEPS = [
  { id: "plan", label: "Research planning", icon: Search },
  { id: "research", label: "Executing research", icon: Search },
  { id: "synthesize", label: "Synthesizing findings", icon: Brain },
  { id: "mece", label: "Building MECE structure", icon: Layers },
  { id: "storyline", label: "Drafting storyline & slides", icon: FileText },
  { id: "save", label: "Saving results", icon: Save },
] as const;

type StepStatus = "pending" | "running" | "done" | "error";
type RunStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export function V2BriefingProgress({
  open,
  onClose,
  projectId,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onComplete?: () => void;
}) {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({});
  const [currentLabel, setCurrentLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startBriefing = useCallback(async () => {
    setStatus("running");
    setProgressPct(0);
    setStepStatuses({});
    setCurrentLabel("Starting…");
    setError(null);

    try {
      await api.briefing.start(projectId);

      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const st = await api.briefing.status(projectId);
          const pct = st.progress_pct || 0;
          setProgressPct(pct);

          const completed = st.steps_completed || [];
          const newStatuses: Record<string, StepStatus> = {};
          for (const s of completed) newStatuses[s] = "done";
          if (st.current_step && st.current_step !== "done" && !completed.includes(st.current_step)) {
            newStatuses[st.current_step] = "running";
          }
          setStepStatuses(newStatuses);

          const stepDef = STEPS.find((s) => s.id === st.current_step);
          setCurrentLabel(stepDef?.label || st.current_step || "Processing…");

          if (st.status === "completed") {
            setStatus("completed");
            setProgressPct(100);
            setCurrentLabel("Done");
            const allDone: Record<string, StepStatus> = {};
            STEPS.forEach((s) => (allDone[s.id] = "done"));
            setStepStatuses(allDone);
            toast.success("Briefing complete · slides ready");
            onComplete?.();
            return;
          } else if (st.status === "failed") {
            setStatus("failed");
            setError(st.error || "Pipeline failed");
            toast.error("Briefing failed");
            return;
          } else if (st.status === "cancelled") {
            setStatus("cancelled");
            setCurrentLabel("Cancelled");
            return;
          }
        } catch {
          // Network glitch, keep polling
        }
      }
      setStatus("failed");
      setError("Briefing timed out after 6 minutes");
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Briefing failed");
      toast.error("Briefing failed");
    }
  }, [projectId, onComplete]);

  async function handleCancel() {
    try {
      await api.briefing.cancel(projectId);
    } catch {
      /* already cancelled or not running */
    }
  }

  function handleClose() {
    if (status === "running") return; // don't allow closing mid-run
    setStatus("idle");
    onClose();
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(26, 24, 20, 0.30)" }}
        onClick={handleClose}
      />

      {/* Centered card */}
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
            maxWidth: 480,
            background: "var(--paper)",
            border: "1px solid var(--line-2)",
            borderRadius: 10,
          }}
        >
          {/* Header */}
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
              Brief Me · Autonomous Pipeline
            </span>
            <div className="flex-1" />
            {status !== "running" && (
              <button
                onClick={handleClose}
                className="cursor-pointer transition-opacity hover:opacity-70"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 4,
                  display: "inline-flex",
                }}
                aria-label="Close briefing dialog"
              >
                <X className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
              </button>
            )}
          </div>

          {/* Body */}
          <div style={{ padding: "18px 20px" }}>
            {status === "idle" ? (
              <>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-2)",
                    lineHeight: 1.55,
                    margin: "0 0 14px",
                  }}
                >
                  The autonomous pipeline researches your topic, builds a MECE structure,
                  drafts a storyline, and generates a full slide deck — hands-off.
                </p>
                <div className="flex flex-col gap-1.5">
                  {STEPS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2.5"
                        style={{ fontSize: 12.5, color: "var(--ink-3)" }}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                        <span>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* Progress bar */}
                <div
                  className="overflow-hidden"
                  style={{ height: 4, background: "var(--line)", borderRadius: 2 }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(2, Math.min(100, progressPct))}%`,
                      background: status === "completed" ? "var(--success)" : "var(--accent)",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>

                {/* Current label + pct */}
                <div className="mt-2.5 mb-3.5 flex items-center gap-2">
                  <span
                    className="truncate"
                    style={{ fontSize: 12.5, color: "var(--ink-2)", flex: 1 }}
                  >
                    {currentLabel}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--ink-3)",
                    }}
                  >
                    {progressPct}%
                  </span>
                </div>

                {/* Step list */}
                <div className="flex flex-col gap-1.5">
                  {STEPS.map((s) => {
                    const Icon = s.icon;
                    const stepStatus = stepStatuses[s.id] || "pending";
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2.5"
                        style={{ fontSize: 12.5 }}
                      >
                        <span
                          className="inline-flex shrink-0 items-center justify-center"
                          style={{ width: 18, height: 18 }}
                        >
                          {stepStatus === "done" && (
                            <CheckCircle2
                              className="h-4 w-4"
                              strokeWidth={2}
                              style={{ color: "var(--success)" }}
                            />
                          )}
                          {stepStatus === "running" && (
                            <Loader2
                              className="h-4 w-4 animate-spin"
                              strokeWidth={1.5}
                              style={{ color: "var(--accent)" }}
                            />
                          )}
                          {stepStatus === "error" && (
                            <XCircle
                              className="h-4 w-4"
                              strokeWidth={2}
                              style={{ color: "var(--danger)" }}
                            />
                          )}
                          {stepStatus === "pending" && (
                            <Icon
                              className="h-3.5 w-3.5"
                              strokeWidth={1.5}
                              style={{ color: "var(--ink-4)" }}
                            />
                          )}
                        </span>
                        <span
                          style={{
                            color: stepStatus === "pending" ? "var(--ink-4)" : "var(--ink)",
                          }}
                        >
                          {s.label}
                        </span>
                        {stepStatus === "running" && (
                          <Chip size="xs" tone="accent">
                            <Dot color="var(--accent)" />
                            now
                          </Chip>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Error */}
                {error && (
                  <div
                    className="mt-3.5 flex items-start gap-2"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 6,
                      background: "color-mix(in oklch, var(--danger) 8%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--danger) 25%, transparent)",
                      fontSize: 12,
                      color: "var(--danger)",
                      lineHeight: 1.4,
                    }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.5} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Completed banner */}
                {status === "completed" && (
                  <div
                    className="mt-3.5 flex items-center gap-2"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 6,
                      background: "color-mix(in oklch, var(--success) 10%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--success) 25%, transparent)",
                      fontSize: 12.5,
                      color: "var(--success)",
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
                    <span>Slides drafted. Close to review them in the workspace.</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex shrink-0 justify-end gap-1.5 border-t"
            style={{ padding: "12px 20px", borderColor: "var(--line)" }}
          >
            {status === "idle" && (
              <>
                <button onClick={handleClose} className="v2bp-ghost-btn">
                  Cancel
                </button>
                <button onClick={startBriefing} className="v2bp-default-btn">
                  <Sparkles className="h-[13px] w-[13px]" strokeWidth={1.5} />
                  Start briefing
                </button>
              </>
            )}
            {status === "running" && (
              <button onClick={handleCancel} className="v2bp-ghost-btn">
                <X className="h-[13px] w-[13px]" strokeWidth={1.5} />
                Cancel run
              </button>
            )}
            {(status === "completed" || status === "cancelled") && (
              <button onClick={handleClose} className="v2bp-default-btn">
                Close
              </button>
            )}
            {status === "failed" && (
              <>
                <button onClick={handleClose} className="v2bp-ghost-btn">
                  Close
                </button>
                <button onClick={startBriefing} className="v2bp-default-btn">
                  <Sparkles className="h-[13px] w-[13px]" strokeWidth={1.5} />
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(.v2-theme .v2bp-ghost-btn) {
          background: transparent;
          color: var(--ink-2);
          border: 1px solid var(--line-2);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          font-family: var(--sans);
          cursor: pointer;
          transition: opacity 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        :global(.v2-theme .v2bp-ghost-btn:hover) {
          opacity: 0.7;
        }
        :global(.v2-theme .v2bp-default-btn) {
          background: var(--ink);
          color: var(--paper);
          border: 1px solid var(--ink);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          font-family: var(--sans);
          cursor: pointer;
          transition: opacity 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        :global(.v2-theme .v2bp-default-btn:hover) {
          opacity: 0.9;
        }
      `}</style>
    </>
  );
}
