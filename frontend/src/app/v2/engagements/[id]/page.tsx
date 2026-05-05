"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Play, Check, Edit3, Loader2, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Project, Slide, Session } from "@/lib/types";
import { Chip, Dot, Logo, V2_STAGES } from "@/lib/v2/primitives";
import { V2Conversation } from "@/components/v2/v2-conversation";
import { V2SlidesRail } from "@/components/v2/v2-slides-rail";

// ────────────────────────────────────────────────────────────────
// Types for storyline data (from sessions.stage_data + storylines table)
// ────────────────────────────────────────────────────────────────

type RawBranch = {
  question?: string;
  evidence?: string;
  evidence_needed?: string;
  so_what?: string;
};

type StorylineData = {
  central_question: string;
  audience: string;
  desired_decision: string;
  situation: string;
  complication: string;
  resolution: string;
  hypothesis: string;
  language: string;
  template: string;
  branches: RawBranch[];
};

// ────────────────────────────────────────────────────────────────
// WorkspaceB — main editor for an engagement
// ────────────────────────────────────────────────────────────────

export default function WorkspaceBPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [storyline, setStoryline] = useState<StorylineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [slidesRailOpen, setSlidesRailOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      api.projects.get(projectId),
      api.sessions.getOrCreate(projectId),
      api.slides.list(projectId),
    ])
      .then(([proj, sess, slds]) => {
        setProject(proj);
        setSession(sess);
        setSlides(slds);
        const sd = (sess.stage_data ?? {}) as Record<string, unknown>;
        const branches = parseBranches(sd.branches);
        setStoryline({
          central_question: typeof sd.central_question === "string" ? sd.central_question : "",
          audience: typeof sd.audience === "string" ? sd.audience : proj.audience ?? "",
          desired_decision: typeof sd.desired_decision === "string" ? sd.desired_decision : "",
          situation: typeof sd.situation === "string" ? sd.situation : "",
          complication: typeof sd.complication === "string" ? sd.complication : "",
          resolution: typeof sd.resolution === "string" ? sd.resolution : "",
          hypothesis: typeof sd.hypothesis === "string" ? sd.hypothesis : "",
          language: typeof sd.language === "string" ? sd.language : "English",
          template: proj.engagement_type ?? proj.deck_type ?? "",
          branches,
        });
      })
      .catch((err) => toast.error("Failed to load engagement: " + err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const activeStage = Math.max(1, Math.min(4, session?.current_stage ?? 1));

  // ── Resizable splitter: canvas (left) vs conversation (right) ────
  // Width is the chat panel size in px. Persisted in localStorage.
  const CHAT_MIN = 320;
  const CHAT_MAX = 900;
  const CHAT_DEFAULT = 420;
  const SPLIT_KEY = "mckinsey-ppt:workspace-chat-width";

  const [chatWidth, setChatWidth] = useState<number>(CHAT_DEFAULT);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SPLIT_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) setChatWidth(clamp(n, CHAT_MIN, CHAT_MAX));
      }
    } catch {
      /* localStorage may be blocked; ignore */
    }
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const next = clamp(rect.right - e.clientX, CHAT_MIN, CHAT_MAX);
      setChatWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { window.localStorage.setItem(SPLIT_KEY, String(chatWidth)); } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [chatWidth]);

  async function handleGenerate() {
    if (slides.length === 0) {
      toast.error("No slides yet — advance through the stages first");
      return;
    }
    setGenerating(true);
    try {
      const deck = await api.decks.generate(projectId);
      toast.success(`Deck generated · score ${deck.validation_score}/100`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    }
    setGenerating(false);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ color: "var(--ink-3)" }}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span style={{ fontSize: 13 }}>Loading engagement…</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{ padding: "12px 24px", borderColor: "var(--line)", background: "var(--paper)" }}
      >
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => router.push("/v2")}
            className="inline-flex items-center transition-opacity hover:opacity-70"
            style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}
          >
            <ArrowLeft className="h-[14px] w-[14px]" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
          </button>
          <Logo size={14} />
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span style={{ fontFamily: "var(--serif)", fontSize: 14 }}>{project?.name ?? "Engagement"}</span>
          {storyline?.audience && (
            <Chip size="xs" tone="ghost">
              {storyline.audience}
            </Chip>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setSlidesRailOpen(true)}
            disabled={slides.length === 0}
            className="v2-ghost-btn"
          >
            <Layers className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Slides
            <Chip size="xs" tone="ghost">{slides.length}</Chip>
          </button>
          <button onClick={handleGenerate} disabled={generating || slides.length === 0} className="v2-default-btn">
            {generating ? (
              <Loader2 className="h-[13px] w-[13px] animate-spin" />
            ) : (
              <Play className="h-[13px] w-[13px]" strokeWidth={1.5} fill="currentColor" />
            )}
            Generate
          </button>
        </div>
      </header>

      {/* Slides drawer (drag-drop reorder) */}
      <V2SlidesRail
        open={slidesRailOpen}
        onClose={() => setSlidesRailOpen(false)}
        projectId={projectId}
        slides={slides}
        onSlidesChange={setSlides}
      />

      {/* ── Big stage stepper ────────────────────────────── */}
      <BigStepper active={activeStage} projectId={projectId} />

      {/* ── 2-column body: canvas + draggable splitter + assistant ── */}
      <div
        ref={splitRef}
        className="grid flex-1 overflow-hidden"
        style={{
          gridTemplateColumns: `minmax(0, 1fr) 6px ${chatWidth}px`,
          minHeight: 0,
        }}
      >
        <StoryCanvas
          storyline={storyline}
          slides={slides}
          activeStage={activeStage}
          projectId={projectId}
        />

        {/* Drag handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize conversation panel"
          onMouseDown={onDragStart}
          onDoubleClick={() => {
            setChatWidth(CHAT_DEFAULT);
            try { window.localStorage.setItem(SPLIT_KEY, String(CHAT_DEFAULT)); } catch {}
          }}
          title="Drag to resize · double-click to reset"
          className="v2-split-handle"
        />

        <div className="flex min-h-0 flex-col" style={{ borderLeft: "1px solid var(--line)" }}>
          <V2Conversation projectId={projectId} />
        </div>
      </div>

      {/* Inline button styles (scoped to .v2-theme) */}
      <style jsx>{`
        :global(.v2-theme .v2-split-handle) {
          cursor: col-resize;
          background: transparent;
          position: relative;
          transition: background 0.15s ease;
        }
        :global(.v2-theme .v2-split-handle::before) {
          content: "";
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 1px;
          transform: translateX(-50%);
          background: var(--line);
        }
        :global(.v2-theme .v2-split-handle:hover) {
          background: color-mix(in oklch, var(--accent) 15%, transparent);
        }
        :global(.v2-theme .v2-split-handle:hover::before) {
          background: var(--accent);
          width: 2px;
        }
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
        :global(.v2-theme .v2-ghost-btn:hover) { opacity: 0.7; }
        :global(.v2-theme .v2-default-btn) {
          background: var(--ink);
          color: var(--paper);
          border: 1px solid var(--ink);
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
        :global(.v2-theme .v2-default-btn:hover) { opacity: 0.9; }
        :global(.v2-theme .v2-default-btn:disabled) {
          background: var(--line-2); color: var(--ink-4); border-color: var(--line-2);
          opacity: 1; cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Big stepper — 4 stage cards across the top
// ────────────────────────────────────────────────────────────────

function BigStepper({ active, projectId }: { active: number; projectId: string }) {
  const router = useRouter();

  const handleStageClick = (n: number) => {
    if (n === 1) router.push(`/v2/engagements/${projectId}/briefing`);
    else if (n === 2) router.push(`/v2/engagements/${projectId}/structure`);
    // Stage 3 and 4 stay on this canonical view
  };

  return (
    <div
      className="shrink-0 border-b"
      style={{
        padding: "24px 24px 18px",
        borderColor: "var(--line)",
        background: "var(--paper)",
      }}
    >
      <div className="grid grid-cols-4 gap-3.5">
        {V2_STAGES.map((s, i) => {
          const stageNum = s.n;
          const state =
            active === stageNum ? "active" : active > stageNum ? "done" : "pending";
          return (
            <button
              key={s.n}
              onClick={() => handleStageClick(stageNum)}
              className="text-left transition-all hover:-translate-y-0.5"
              style={{
                position: "relative",
                padding: "14px 16px 16px",
                background: state === "active" ? "var(--bg)" : "transparent",
                border:
                  "1px solid " +
                  (state === "active"
                    ? "var(--ink)"
                    : state === "done"
                      ? "var(--line-2)"
                      : "var(--line)"),
                borderRadius: 8,
                opacity: state === "pending" ? 0.55 : 1,
                cursor: "pointer",
              }}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "var(--ink-3)",
                    letterSpacing: 1,
                  }}
                >
                  STAGE {String(stageNum).padStart(2, "0")}
                </span>
                {state === "done" && (
                  <Check
                    className="h-[12px] w-[12px]"
                    strokeWidth={2.5}
                    style={{ color: "var(--success)" }}
                  />
                )}
                {state === "active" && <Dot color="var(--accent)" size={7} />}
              </div>
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 22,
                  letterSpacing: -0.4,
                  lineHeight: 1.1,
                  color: "var(--ink)",
                }}
              >
                {s.name}
              </div>
              <div className="mt-1" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {s.sub}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// StoryCanvas — main left zone
// ────────────────────────────────────────────────────────────────

function StoryCanvas({
  storyline,
  slides,
  activeStage,
  projectId,
}: {
  storyline: StorylineData | null;
  slides: Slide[];
  activeStage: number;
  projectId: string;
}) {
  const router = useRouter();

  return (
    <div className="overflow-auto" style={{ padding: "36px 44px" }}>
      {/* ── Central question ──────────────────────── */}
      <div className="v2-kicker mb-2">CENTRAL QUESTION</div>
      <h1
        className="m-0 mb-5"
        style={{
          fontFamily: "var(--serif)",
          fontSize: 36,
          letterSpacing: -0.8,
          lineHeight: 1.1,
          fontWeight: 400,
          color: "var(--ink)",
        }}
      >
        {storyline?.central_question || "Define the central question to unlock the engagement"}
      </h1>

      {/* ── Meta cells ────────────────────────────── */}
      <div className="mb-9 flex gap-3" style={{ fontSize: 12 }}>
        <MetaCell label="Audience" value={prettifyValue(storyline?.audience) || "—"} />
        <MetaCell label="Decision" value={storyline?.desired_decision || "—"} />
        <MetaCell label="Language" value={prettifyValue(storyline?.language) || "English"} />
        <MetaCell label="Template" value={prettifyValue(storyline?.template) || "—"} />
      </div>

      {/* ── Stage 02: MECE ──────────────────────────── */}
      <SectionTitle
        n="02"
        name="MECE Structure"
        locked={activeStage > 2}
        active={activeStage === 2}
        onEdit={() => router.push(`/v2/engagements/${projectId}/structure`)}
      />
      <IssueTree branches={storyline?.branches ?? []} activeIdx={activeStage === 2 ? 1 : -1} />

      {/* ── Stage 03: Storyline ─────────────────────── */}
      <div className="mt-11">
        <SectionTitle
          n="03"
          name="Storyline"
          locked={activeStage > 3}
          active={activeStage === 3}
        />
        <StorylineOutline storyline={storyline} slides={slides} projectId={projectId} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Meta cell
// ────────────────────────────────────────────────────────────────

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex-1"
      style={{
        padding: "10px 14px",
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "var(--paper)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: 1.3,
          color: "var(--ink-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div className="mt-0.5" style={{ fontSize: 13, color: "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Section title
// ────────────────────────────────────────────────────────────────

function SectionTitle({
  n,
  name,
  locked,
  active,
  onEdit,
}: {
  n: string;
  name: string;
  locked?: boolean;
  active?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div
      className="mb-4 flex items-baseline gap-3 pb-2.5"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>{n}</span>
      <span style={{ fontFamily: "var(--serif)", fontSize: 20, letterSpacing: -0.3 }}>{name}</span>
      {locked && (
        <Chip size="xs" tone="ghost">
          locked
        </Chip>
      )}
      {active && (
        <Chip size="xs" tone="accent">
          active
        </Chip>
      )}
      <div className="flex-1" />
      {onEdit && (
        <button
          onClick={onEdit}
          className="cursor-pointer transition-opacity hover:opacity-70"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ink-2)",
            fontSize: 11,
            fontWeight: 500,
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Edit3 className="h-[11px] w-[11px]" strokeWidth={1.5} />
          edit
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Issue tree (mini, just for the canonical view)
// ────────────────────────────────────────────────────────────────

function IssueTree({ branches, activeIdx }: { branches: RawBranch[]; activeIdx: number }) {
  if (branches.length === 0) {
    return (
      <div
        className="text-center"
        style={{
          padding: "24px",
          border: "1px dashed var(--line-2)",
          borderRadius: 8,
          background: "var(--paper)",
          color: "var(--ink-3)",
          fontSize: 13,
        }}
      >
        Issue tree will appear once Stage 02 generates the MECE branches.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3.5">
      {branches.slice(0, 3).map((b, i) => {
        const isActive = i === activeIdx;
        const id = String.fromCharCode(65 + i);
        const subs = (b.evidence || b.evidence_needed || "").split(/[,;]\s*/).filter(Boolean).slice(0, 3);
        return (
          <div
            key={i}
            style={{
              border: "1px solid " + (isActive ? "var(--accent)" : "var(--line)"),
              background: isActive ? "var(--accent-soft)" : "var(--paper)",
              borderRadius: 8,
              padding: "14px 16px",
            }}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--ink-3)",
                  letterSpacing: 1,
                }}
              >
                BRANCH {id}
              </span>
              {isActive && <Dot color="var(--accent)" size={6} />}
            </div>
            <div
              className="mb-3"
              style={{
                fontFamily: "var(--serif)",
                fontSize: 17,
                lineHeight: 1.2,
                letterSpacing: -0.2,
                color: "var(--ink)",
              }}
            >
              {b.question || `Branch ${id}`}
            </div>
            <div className="flex flex-col gap-1">
              {subs.map((s, j) => (
                <div
                  key={j}
                  className="flex gap-2"
                  style={{ fontSize: 12, color: "var(--ink-2)" }}
                >
                  <span style={{ color: "var(--ink-4)" }}>—</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Storyline outline — SCR card + slides grouped by section
// ────────────────────────────────────────────────────────────────

function StorylineOutline({
  storyline,
  slides,
  projectId,
}: {
  storyline: StorylineData | null;
  slides: Slide[];
  projectId: string;
}) {
  const router = useRouter();

  if (slides.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {/* SCR card (placeholder when no slides) */}
        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--paper)",
            borderRadius: 8,
            padding: "16px 20px",
          }}
        >
          <div className="v2-kicker mb-2.5" style={{ fontSize: 10, letterSpacing: 1.5 }}>
            SCR — THE PYRAMID
          </div>
          <div
            style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}
          >
            Once Stage 03 runs, the Situation–Complication–Resolution will appear here.
          </div>
        </div>

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
          No slides yet — advance to Stage 03 to start drafting the deck.
        </div>
      </div>
    );
  }

  // Group slides into sections by divider slides
  const sections: { name: string; slides: Slide[] }[] = [];
  let current: { name: string; slides: Slide[] } | null = null;
  slides.forEach((s) => {
    if (s.slide_type === "divider" || s.slide_type === "section_divider") {
      if (current) sections.push(current);
      current = { name: s.action_title, slides: [] };
    } else if (current) {
      current.slides.push(s);
    } else {
      // Slides before the first divider go into a "Front matter" group
      if (sections.length === 0)
        sections.push({ name: "Front matter", slides: [s] });
      else sections[sections.length - 1].slides.push(s);
    }
  });
  if (current) sections.push(current);

  return (
    <div className="flex flex-col gap-6">
      {/* SCR card */}
      <div
        style={{
          border: "1px solid var(--line)",
          background: "var(--paper)",
          borderRadius: 8,
          padding: "16px 20px",
        }}
      >
        <div className="v2-kicker mb-2.5" style={{ fontSize: 10, letterSpacing: 1.5 }}>
          SCR — THE PYRAMID
        </div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "100px 1fr",
            rowGap: 10,
            columnGap: 16,
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          <span className="v2-kicker pt-0.5" style={{ fontSize: 10, letterSpacing: 1 }}>
            SITUATION
          </span>
          <span style={{ color: "var(--ink-2)" }}>{storyline?.situation || "—"}</span>
          <span className="v2-kicker pt-0.5" style={{ fontSize: 10, letterSpacing: 1 }}>
            COMPLICATION
          </span>
          <span style={{ color: "var(--ink-2)" }}>{storyline?.complication || "—"}</span>
          <span
            className="pt-0.5"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--accent)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            RESOLUTION
          </span>
          <span
            style={{
              fontFamily: "var(--serif)",
              fontSize: 17,
              letterSpacing: -0.2,
              lineHeight: 1.3,
              color: "var(--ink)",
            }}
          >
            {storyline?.resolution || storyline?.hypothesis || "—"}
          </span>
        </div>
      </div>

      {/* Sections */}
      {sections.map((sec, i) => (
        <div key={i}>
          <div className="mb-2.5 flex items-baseline gap-2.5">
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--ink-3)",
                letterSpacing: 1,
              }}
            >
              SEC {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ fontFamily: "var(--serif)", fontSize: 16, letterSpacing: -0.2 }}>
              {sec.name}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              · {sec.slides.length} slides
            </span>
          </div>
          <div className="flex flex-col">
            {sec.slides.map((s, j) => (
              <button
                key={s.id}
                onClick={() => router.push(`/v2/engagements/${projectId}/slides/${s.id}`)}
                className="flex gap-3.5 text-left transition-colors hover:bg-black/[.02]"
                style={{
                  padding: "10px 0",
                  borderBottom: "1px dashed var(--line)",
                  background: "transparent",
                  border: "none",
                  borderTop: 0,
                  borderLeft: 0,
                  borderRight: 0,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: "var(--ink-4)",
                    width: 26,
                  }}
                >
                  {String(s.position + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <div
                    style={{
                      fontFamily: "var(--serif)",
                      fontSize: 15.5,
                      letterSpacing: -0.15,
                      lineHeight: 1.3,
                      color: "var(--ink)",
                    }}
                  >
                    {s.action_title}
                  </div>
                  <div
                    className="mt-1 flex gap-2.5"
                    style={{ fontSize: 11, color: "var(--ink-3)" }}
                  >
                    <span>{slideTypeName(s.slide_type)}</span>
                  </div>
                </div>
                <span
                  className="cursor-pointer transition-opacity hover:opacity-70"
                  style={{
                    color: "var(--ink-3)",
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "4px 8px",
                  }}
                >
                  refine
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

/** Clamp a number into [min, max]. Used by the resizable splitter. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseBranches(raw: unknown): RawBranch[] {
  if (Array.isArray(raw)) return raw as RawBranch[];
  if (typeof raw === "string" && raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RawBranch[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function slideTypeName(type: string): string {
  const map: Record<string, string> = {
    title: "Title",
    executive_summary: "Exec Summary",
    agenda: "Agenda",
    divider: "Divider",
    content_text: "Text",
    content_chart: "Chart",
    content_hybrid: "Hybrid",
    content_table: "Table",
    content_framework: "Framework",
    recommendation: "Recommendation",
    next_steps: "Next Steps",
    appendix_divider: "Appendix Divider",
    appendix_content: "Appendix",
  };
  return map[type] ?? type;
}

/**
 * Convert a backend-style value (snake_case, lowercase) into a human label
 * shown in meta cells. Handles known mappings first, then falls back to
 * generic snake_case → Title Case conversion.
 */
function prettifyValue(value: string | undefined): string {
  if (!value) return "";
  const KNOWN: Record<string, string> = {
    board: "Board",
    client: "Client",
    working_team: "Working Team",
    steering: "Steering",
    investors: "Investors",
    technical_leads: "Technical Leads",
    strategic: "Strategic",
    diagnostic: "Diagnostic",
    market_entry: "Market Entry",
    due_diligence: "Due Diligence",
    transformation: "Transformation",
    progress_update: "Progress Update",
    implementation: "Implementation",
    strategic_assessment: "Strategic Assessment",
    commercial_due_diligence: "Commercial Due Diligence",
    performance_improvement: "Performance Improvement",
    en: "English",
    es: "Spanish",
    pt: "Portuguese",
    fr: "French",
    de: "German",
  };
  const key = value.toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  // Generic: snake_case → Title Case
  return value
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
