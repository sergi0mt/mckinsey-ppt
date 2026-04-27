/**
 * useV2Chat — SSE streaming chat hook for the V2 redesign.
 *
 * Encapsulates the same SSE protocol used by the V1 chat (extracted from
 * `frontend/src/app/projects/[id]/page.tsx`):
 *  - `data: {"type":"text", "content":"..."}` — token chunks for the assistant
 *    bubble
 *  - `event: research` + `data: {...}` — research-agent progress events
 *    (plan_start, step_done, synthesize_done, …)
 *  - `event: refine` + `data: {...}` — self-refine critique/refine events
 *  - The trailing assistant message may contain a hidden
 *    `<!-- OPTIONS_JSON: [...] -->` block. We strip it and surface the array
 *    as `interactiveOptions` for the option pills UI.
 *
 * The hook owns no UI — it just exposes state + a `sendMessage()` callback
 * that the consumer can wire to a textarea/button.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Message, Session, Slide, ValidationReport, Deck } from "@/lib/types";

export type ChatStatus =
  | "idle"
  | "sending"
  | "streaming"
  | "researching"
  | "refining";

export type ResearchProgress = {
  /** A short status line shown to the user, e.g. "Searching: Brazil GDP". */
  label: string;
  /** Percent 0–100 (best-effort, derived from event index). */
  pct: number;
};

export type RefineProgress = {
  /** Pass number 1 or 2. */
  pass: number;
  /** Last critique score 0–100, or null while critiquing. */
  score: number | null;
  /** Human-readable status. */
  label: string;
};

export type SendOptions = {
  use_web_search?: boolean;
  research_depth?: string;
  auto_refine?: boolean;
  output_tone?: string;
  output_audience?: string;
  output_language?: string;
};

/** Strip `<!-- OPTIONS_JSON: [...] -->` block from text and return both. */
export function extractOptions(text: string): [string, string[]] {
  const match = text.match(/<!--\s*OPTIONS_JSON:\s*(\[[\s\S]*?\])\s*-->/);
  if (!match) return [text, []];
  try {
    const options = JSON.parse(match[1]);
    if (Array.isArray(options) && options.every((o: unknown) => typeof o === "string")) {
      const clean = text.replace(match[0], "").trimEnd();
      return [clean, options];
    }
  } catch {
    /* fall through */
  }
  return [text, []];
}

export function useV2Chat(projectId: string | undefined) {
  // Persisted state from backend
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [latestDeck, setLatestDeck] = useState<Deck | null>(null);

  // Loading flags
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ChatStatus>("idle");

  // Live streaming state
  const [streamText, setStreamText] = useState("");
  const [interactiveOptions, setInteractiveOptions] = useState<string[]>([]);
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null);
  const [refineProgress, setRefineProgress] = useState<RefineProgress | null>(null);

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      api.sessions.getOrCreate(projectId),
      api.slides.list(projectId),
    ])
      .then(async ([sess, slds]) => {
        setSession(sess);
        setSlides(slds);
        const msgs = await api.sessions.getMessages(sess.id);
        setMessages(msgs);
      })
      .catch((err) =>
        toast.error("Failed to load chat: " + (err instanceof Error ? err.message : "?")),
      )
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── Send message with SSE ─────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string, options: SendOptions = {}) => {
      if (!session || !content.trim() || status !== "idle") return;
      setStatus("sending");
      setStreamText("");
      setInteractiveOptions([]);
      setResearchProgress(null);
      setRefineProgress(null);

      // Optimistically render the user message
      const userMsg: Message = {
        id: crypto.randomUUID(),
        session_id: session.id,
        role: "user",
        content,
        stage: session.current_stage,
        metadata: {},
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const response = await api.sessions.sendMessage(session.id, content, {
          use_web_search: options.use_web_search ?? false,
          research_depth: options.research_depth ?? "detailed",
          auto_refine: options.auto_refine ?? false,
          output_tone: options.output_tone,
          output_audience: options.output_audience,
          output_language: options.output_language,
        });
        if (!response.body) {
          setStatus("idle");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";
        let researchStepCount = 0;
        setStatus("streaming");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];

            // ── Research events ─────────────────────────────
            if (line.startsWith("event: research") && li + 1 < lines.length && lines[li + 1].startsWith("data: ")) {
              try {
                const data = JSON.parse(lines[li + 1].slice(6));
                setStatus("researching");
                if (data.type === "plan_start") {
                  setResearchProgress({ label: "Planning research…", pct: 5 });
                } else if (data.type === "plan_done") {
                  setResearchProgress({ label: `Plan ready: ${data.num_steps ?? "?"} sub-questions`, pct: 15 });
                } else if (data.type === "step_start") {
                  researchStepCount++;
                  setResearchProgress({
                    label: `Searching: ${(data.sub_question || "").slice(0, 60)}…`,
                    pct: 15 + Math.min(70, researchStepCount * 10),
                  });
                } else if (data.type === "step_done") {
                  setResearchProgress({
                    label: `Step ${data.step_id} done — ${data.result_count ?? 0} results`,
                    pct: 15 + Math.min(70, researchStepCount * 10),
                  });
                } else if (data.type === "synthesize_start") {
                  setResearchProgress({ label: "Synthesizing findings…", pct: 90 });
                } else if (data.type === "research_complete") {
                  setResearchProgress({
                    label: `Research complete · ${data.total_sources ?? 0} sources`,
                    pct: 100,
                  });
                  // Auto-clear after a brief pause
                  window.setTimeout(() => setResearchProgress(null), 2500);
                  setStatus("streaming");
                }
                li++; // consume the data line
              } catch {
                /* skip */
              }
              continue;
            }

            // ── Refine events ────────────────────────────────
            if (line.startsWith("event: refine") && li + 1 < lines.length && lines[li + 1].startsWith("data: ")) {
              try {
                const data = JSON.parse(lines[li + 1].slice(6));
                setStatus("refining");
                if (data.type === "critique_start") {
                  setRefineProgress({ pass: data.pass, score: null, label: `Pass ${data.pass}: critiquing…` });
                } else if (data.type === "critique_done") {
                  setRefineProgress({
                    pass: data.pass,
                    score: data.score,
                    label: `Score: ${data.score}/100 — ${data.weaknesses?.length || 0} issues`,
                  });
                } else if (data.type === "refine_start") {
                  setRefineProgress((p) => ({ ...(p ?? { pass: data.pass, score: null }), label: `Pass ${data.pass}: improving…` }));
                } else if (data.type === "refine_done" && !data.error) {
                  setRefineProgress((p) => ({ ...(p ?? { pass: 1, score: null }), label: "Slides refined" }));
                } else if (data.type === "quality_gate_passed") {
                  setRefineProgress({ pass: data.pass, score: data.final_score, label: `Quality gate passed: ${data.final_score}/100` });
                  toast.success(`Auto-refine: ${data.final_score}/100`);
                } else if (data.type === "max_passes_reached") {
                  setRefineProgress((p) => ({ ...(p ?? { pass: 2, score: data.final_score }), label: `Final: ${data.final_score}/100` }));
                }
                li++;
              } catch {
                /* skip */
              }
              continue;
            }

            // ── Plain `data:` text chunks ─────────────────────
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "text") {
                  fullText += data.content;
                  setStreamText(fullText);
                } else if (data.type === "error") {
                  fullText += `\n\nError: ${data.content}`;
                  setStreamText(fullText);
                }
              } catch {
                /* skip */
              }
            }
          }
        }

        // ── Finalize: append assistant message with options stripped ──
        if (fullText) {
          const [cleanText, options] = extractOptions(fullText);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              session_id: session.id,
              role: "assistant",
              content: cleanText,
              stage: session.current_stage,
              metadata: {},
              created_at: new Date().toISOString(),
            },
          ]);
          setInteractiveOptions(options);
        }

        // Re-fetch session + slides — stage may have advanced
        const [newSession, newSlides] = await Promise.all([
          api.sessions.getOrCreate(projectId!),
          api.slides.list(projectId!),
        ]);
        setSession(newSession);
        setSlides(newSlides);

        // Clear stale validation/deck if slide list changed
        if (newSlides.length !== slides.length || newSlides.some((s, i) => s.id !== slides[i]?.id)) {
          setValidation(null);
          setLatestDeck(null);
        }

        if (newSession.current_stage !== session.current_stage) {
          const STAGE_NAMES = ["", "Define Problem", "MECE Structure", "Build Storyline", "Generate Deck"];
          toast.success(`Advanced to Stage ${newSession.current_stage}: ${STAGE_NAMES[newSession.current_stage]}`);
        }
        if (newSlides.length > 0 && slides.length === 0) {
          toast.success(`${newSlides.length} slides created!`);
        }
      } catch (err) {
        toast.error("Chat error: " + (err instanceof Error ? err.message : "Unknown"));
      } finally {
        setStatus("idle");
        setStreamText("");
        // Leave researchProgress visible briefly; clear refineProgress after delay
        window.setTimeout(() => setRefineProgress(null), 4000);
      }
    },
    [session, status, projectId, slides],
  );

  // ── Auto-send queued option ─────────────────────────────────
  const pendingOptionRef = useRef<string | null>(null);

  const selectOption = useCallback(
    (option: string, options: SendOptions = {}) => {
      if (status !== "idle") return;
      setInteractiveOptions([]);
      pendingOptionRef.current = option;
      // Use a microtask to ensure React renders before we send
      Promise.resolve().then(() => {
        if (pendingOptionRef.current) {
          const opt = pendingOptionRef.current;
          pendingOptionRef.current = null;
          sendMessage(opt, options);
        }
      });
    },
    [status, sendMessage],
  );

  // ── Refresh helpers ─────────────────────────────────────────
  const refreshSlides = useCallback(async () => {
    if (!projectId) return;
    const list = await api.slides.list(projectId);
    setSlides(list);
  }, [projectId]);

  const validateDeck = useCallback(async () => {
    if (!projectId) return;
    const r = await api.validation.validate(projectId);
    setValidation(r);
    return r;
  }, [projectId]);

  const generateDeck = useCallback(async () => {
    if (!projectId) return;
    const deck = await api.decks.generate(projectId);
    setLatestDeck(deck);
    return deck;
  }, [projectId]);

  return {
    // State
    session,
    messages,
    slides,
    validation,
    latestDeck,
    loading,
    status,
    streamText,
    interactiveOptions,
    researchProgress,
    refineProgress,
    // Actions
    sendMessage,
    selectOption,
    refreshSlides,
    validateDeck,
    generateDeck,
    // Setters (for advanced use)
    setSlides,
    setSession,
  };
}
