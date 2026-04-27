"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, LayoutGrid, List, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { Chip, Dot, Logo, ProgressBars, V2_STAGES } from "@/lib/v2/primitives";

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

/** Format an ISO timestamp as a human-readable "x ago" string. */
function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 7)}w ago`;
}

/** Map a project's status hint based on stage + slide count. */
function getProjectStatus(project: Project): "active" | "done" | "archived" {
  if (project.current_stage === 4 && project.slide_count > 0) return "done";
  if (project.current_stage === 0) return "archived";
  return "active";
}

// ────────────────────────────────────────────────────────────────
// Engagement Card
// ────────────────────────────────────────────────────────────────

function EngagementCard({
  project,
  featured = false,
  onClick,
}: {
  project: Project;
  featured?: boolean;
  onClick: () => void;
}) {
  const status = getProjectStatus(project);
  const stage = Math.max(1, Math.min(4, project.current_stage || 1));
  const stageName = V2_STAGES[stage - 1]?.name ?? "Define Problem";

  const statusTone =
    status === "active" ? "accent" : status === "done" ? "success" : "ghost";

  return (
    <button
      onClick={onClick}
      className="text-left transition-all hover:-translate-y-0.5"
      style={{
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        cursor: "pointer",
        outline: featured
          ? `2px solid color-mix(in oklch, var(--accent) 40%, transparent)`
          : "none",
        outlineOffset: featured ? -2 : 0,
      }}
    >
      {/* Top row: status chip + score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Chip size="xs" tone={statusTone}>
            <Dot color="currentColor" />
            {status}
          </Chip>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Updated {formatRelativeTime(project.updated_at)}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="v2-h3 m-0" style={{ minHeight: "2.4em" }}>
        {project.name}
      </h3>

      {/* Stage progress bars */}
      <div className="flex flex-col gap-1.5">
        <ProgressBars stage={stage} />
        <div
          className="flex items-center justify-between"
          style={{ fontSize: 12, color: "var(--ink-3)" }}
        >
          <span>
            Stage {stage} of 4 — {stageName}
          </span>
          <span>{project.slide_count} slides</span>
        </div>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
// V2 Landing — main page
// ────────────────────────────────────────────────────────────────

export default function V2Landing() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    api.projects
      .list()
      .then((data) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const goToImport = () => router.push("/v2/import");
  const openProject = (id: string) => router.push(`/v2/engagements/${id}`);

  return (
    <div className="flex h-screen w-full flex-col">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{
          padding: "18px 32px",
          borderColor: "var(--line)",
        }}
      >
        <Logo size={18} />
        <div className="flex items-center gap-2.5">
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>sergio@acme.com</div>
          <div
            className="grid place-items-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "var(--ink)",
              color: "var(--paper)",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            SM
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────── */}
      <section
        className="border-b"
        style={{
          padding: "56px 72px 36px",
          borderColor: "var(--line)",
        }}
      >
        <div className="v2-kicker mb-4">
          Sube un informe de deepresearch · obtené un deck estilo McKinsey
        </div>
        <h1
          className="v2-display m-0"
          style={{ maxWidth: 820 }}
        >
          Drop the research, ship the deck —{" "}
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>
            with the rigor of a Monday-morning partner review
          </em>
          .
        </h1>
        <div className="mt-7 flex gap-2.5">
          <button
            onClick={goToImport}
            className="inline-flex items-center gap-2 transition-all hover:opacity-90"
            style={{
              background: "var(--ink)",
              color: "var(--paper)",
              border: "1px solid var(--ink)",
              borderRadius: 6,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "var(--sans)",
              cursor: "pointer",
            }}
          >
            <FileText className="h-[15px] w-[15px]" strokeWidth={1.5} />
            Import report
          </button>
          <div className="flex-1" />
          <button
            className="inline-flex items-center gap-2 transition-colors hover:opacity-80"
            style={{
              background: "transparent",
              color: "var(--ink-2)",
              border: "1px solid transparent",
              borderRadius: 6,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "var(--sans)",
              cursor: "pointer",
            }}
          >
            View the methodology
            <ArrowRight className="h-[15px] w-[15px]" strokeWidth={1.5} />
          </button>
        </div>
      </section>

      {/* ── Engagements list ───────────────────────────── */}
      <section
        className="flex-1 overflow-auto"
        style={{ padding: "32px 72px" }}
      >
        <div className="mb-5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2.5">
            <h2 className="v2-h2 m-0">Engagements</h2>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
              {loading ? "" : `${projects.length} ${projects.length === 1 ? "engagement" : "engagements"}`}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setView("grid")}
              className="inline-flex items-center gap-1.5 transition-colors hover:bg-black/[.03]"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: view === "grid" ? "var(--ink)" : "var(--ink-3)",
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid transparent",
                background: view === "grid" ? "rgba(0,0,0,0.04)" : "transparent",
                cursor: "pointer",
                fontFamily: "var(--sans)",
              }}
            >
              <LayoutGrid className="h-[13px] w-[13px]" strokeWidth={1.5} />
              Grid
            </button>
            <button
              onClick={() => setView("list")}
              className="inline-flex items-center gap-1.5 transition-colors hover:bg-black/[.03]"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: view === "list" ? "var(--ink)" : "var(--ink-3)",
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid transparent",
                background: view === "list" ? "rgba(0,0,0,0.04)" : "transparent",
                cursor: "pointer",
                fontFamily: "var(--sans)",
              }}
            >
              <List className="h-[13px] w-[13px]" strokeWidth={1.5} />
              List
            </button>
          </div>
        </div>

        {/* ── Grid / Empty / Loading ──────────────────── */}
        {loading ? (
          <div
            className="flex items-center justify-center py-20"
            style={{ color: "var(--ink-3)" }}
          >
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span style={{ fontSize: 13 }}>Loading engagements…</span>
          </div>
        ) : projects.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20"
            style={{
              border: "1px dashed var(--line-2)",
              borderRadius: 10,
              background: "var(--paper)",
            }}
          >
            <div className="v2-h3 mb-2">No engagements yet</div>
            <p className="mb-5" style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 420, textAlign: "center" }}>
              Subí tu primer informe de deepresearch y la app va a generar un deck estilo McKinsey listo para presentar.
            </p>
            <Button onClick={goToImport} variant="default" size="default" className="rounded-md">
              <FileText className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
              Import report
            </Button>
          </div>
        ) : (
          <div
            className={
              view === "grid"
                ? "grid grid-cols-1 gap-4 md:grid-cols-2"
                : "flex flex-col gap-2"
            }
          >
            {projects.map((p, i) => (
              <EngagementCard
                key={p.id}
                project={p}
                featured={i === 0 && view === "grid"}
                onClick={() => openProject(p.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
