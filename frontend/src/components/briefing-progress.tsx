"use client";

import { useState, useCallback } from "react";
import {
  Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Search, Brain, Layers, FileText, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";

const STEPS = [
  { id: "plan", label: "Research Planning", icon: Search },
  { id: "research", label: "Executing Research", icon: Search },
  { id: "synthesize", label: "Synthesizing Findings", icon: Brain },
  { id: "mece", label: "Building MECE Structure", icon: Layers },
  { id: "storyline", label: "Creating Storyline & Slides", icon: FileText },
  { id: "save", label: "Saving Results", icon: Save },
];

interface BriefingProgressProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onComplete?: () => void;
}

type StepStatus = "pending" | "running" | "done" | "error";
type RunStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export default function BriefingProgress({ open, onOpenChange, projectId, onComplete }: BriefingProgressProps) {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({});
  const [currentLabel, setCurrentLabel] = useState("");
  const [slideCount, setSlideCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startBriefing = useCallback(async () => {
    setStatus("running");
    setProgressPct(0);
    setStepStatuses({});
    setCurrentLabel("Starting...");
    setSlideCount(0);
    setError(null);

    try {
      // Step 1: Create the run and start the pipeline
      await api.briefing.start(projectId);

      // Step 2: Poll status endpoint every 3 seconds (pipeline runs as background task)
      const STEP_ORDER = ["plan", "research", "synthesize", "mece", "storyline", "save", "done"];

      const poll = async () => {
        for (let i = 0; i < 120; i++) { // max 6 minutes
          await new Promise(r => setTimeout(r, 3000));
          try {
            const st = await api.briefing.status(projectId);
            const pct = st.progress_pct || 0;
            setProgressPct(pct);

            // Update step statuses
            const completed = st.steps_completed || [];
            const newStatuses: Record<string, StepStatus> = {};
            for (const s of completed) newStatuses[s] = "done";
            if (st.current_step && st.current_step !== "done" && !completed.includes(st.current_step)) {
              newStatuses[st.current_step] = "running";
            }
            setStepStatuses(newStatuses);

            // Update label
            const stepDef = STEPS.find(s => s.id === st.current_step);
            setCurrentLabel(stepDef?.label || st.current_step || "Processing...");

            if (st.status === "completed") {
              setStatus("completed");
              setProgressPct(100);
              setCurrentLabel("Done!");
              // Mark all steps done
              const allDone: Record<string, StepStatus> = {};
              STEPS.forEach(s => allDone[s.id] = "done");
              setStepStatuses(allDone);
              toast.success("Briefing complete!");
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
            // Network error, keep polling
          }
        }
        // Timeout
        setStatus("failed");
        setError("Briefing timed out after 6 minutes");
      };

      await poll();
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Briefing failed");
      toast.error("Briefing failed");
    }
  }, [projectId, onComplete]);

  async function handleCancel() {
    try {
      await api.briefing.cancel(projectId);
    } catch { /* already cancelled or not running */ }
  }

  function handleClose() {
    if (status !== "running") {
      setStatus("idle");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0065BD]" />
            Brief Me — Autonomous Pipeline
          </DialogTitle>
        </DialogHeader>

        {status === "idle" ? (
          <>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                The autonomous pipeline will research your topic, build a MECE structure,
                create a storyline, and generate a full slide deck — all automatically.
              </p>
              <div className="space-y-1.5">
                {STEPS.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.id} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" onClick={startBriefing} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Start Briefing
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-[#0065BD] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Current step label */}
            <p className="text-xs text-center text-muted-foreground truncate">
              {currentLabel}
            </p>

            {/* Step indicators */}
            <div className="space-y-1.5">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const stepStatus = stepStatuses[step.id] || "pending";
                return (
                  <div key={step.id} className="flex items-center gap-2.5 text-xs">
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {stepStatus === "done" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      {stepStatus === "running" && <Loader2 className="w-4 h-4 text-[#0065BD] animate-spin" />}
                      {stepStatus === "error" && <XCircle className="w-4 h-4 text-destructive" />}
                      {stepStatus === "pending" && <Icon className="w-3.5 h-3.5 text-muted-foreground/40" />}
                    </div>
                    <span className={stepStatus === "pending" ? "text-muted-foreground/40" : "text-foreground"}>
                      {step.label}
                    </span>
                    {stepStatus === "done" && step.id === "storyline" && slideCount > 0 && (
                      <span className="ml-auto text-[10px] text-green-600">{slideCount} slides</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Error display */}
            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Completed summary */}
            {status === "completed" && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Briefing complete! {slideCount} slides generated. Check the Slides panel.</span>
              </div>
            )}

            <DialogFooter>
              {status === "running" && (
                <Button variant="outline" size="sm" onClick={handleCancel} className="gap-1">
                  <X className="w-3 h-3" /> Cancel
                </Button>
              )}
              {(status === "completed" || status === "failed" || status === "cancelled") && (
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Close
                </Button>
              )}
              {status === "failed" && (
                <Button size="sm" onClick={startBriefing} className="gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Retry
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
