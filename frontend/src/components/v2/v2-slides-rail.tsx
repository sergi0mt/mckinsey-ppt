/**
 * V2SlidesRail — sortable slide tray for the V2 Workspace.
 *
 * Renders as a slide-out drawer from the right edge of the viewport,
 * triggered by the "Slides (N)" button in WorkspaceB header.
 * Each slide is draggable (via @dnd-kit) with an optimistic reorder
 * that calls `api.slides.reorder()` on drop.
 *
 * Designed to coexist with the V2Conversation rail — opening this drawer
 * temporarily covers the conversation, closing returns to the chat.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Slide } from "@/lib/types";
import { Chip } from "@/lib/v2/primitives";

// ────────────────────────────────────────────────────────────────
// Slide type → friendly label (consistent with workspace page)
// ────────────────────────────────────────────────────────────────

const SLIDE_TYPE_LABELS: Record<string, string> = {
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

// ────────────────────────────────────────────────────────────────
// V2SlidesRail
// ────────────────────────────────────────────────────────────────

export function V2SlidesRail({
  open,
  onClose,
  projectId,
  slides,
  onSlidesChange,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  slides: Slide[];
  /** Called after a successful reorder — parent updates its slide list. */
  onSlidesChange: (next: Slide[]) => void;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = slides.findIndex((s) => s.id === active.id);
    const newIndex = slides.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(slides, oldIndex, newIndex).map((s, i) => ({
      ...s,
      position: i,
    }));
    onSlidesChange(reordered);

    try {
      await api.slides.reorder(projectId, reordered.map((s) => s.id));
    } catch (err) {
      toast.error("Reorder failed: " + (err instanceof Error ? err.message : "?"));
      // Revert on failure
      onSlidesChange(slides);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const list = await api.slides.list(projectId);
      onSlidesChange(list);
      toast.success("Slides refreshed");
    } catch {
      toast.error("Refresh failed");
    }
    setRefreshing(false);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity"
        style={{ background: "rgba(26, 24, 20, 0.25)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-screen flex-col shadow-2xl"
        style={{
          width: 420,
          background: "var(--paper)",
          borderLeft: "1px solid var(--line-2)",
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center gap-2.5 border-b"
          style={{ padding: "14px 18px", borderColor: "var(--line)" }}
        >
          <span className="v2-kicker" style={{ fontSize: 11, letterSpacing: 1 }}>
            Slides
          </span>
          <Chip size="xs" tone="ghost">
            {slides.length}
          </Chip>
          <div className="flex-1" />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{
              background: "transparent",
              border: "none",
              padding: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--ink-3)",
              fontFamily: "var(--sans)",
            }}
            title="Refresh from server"
          >
            <RefreshCw
              className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            Refresh
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer transition-opacity hover:opacity-70"
            style={{
              background: "transparent",
              border: "none",
              padding: 4,
              display: "inline-flex",
            }}
            aria-label="Close slides drawer"
          >
            <X className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
          </button>
        </div>

        {/* Description strip */}
        <div
          className="shrink-0 border-b"
          style={{
            padding: "10px 18px",
            borderColor: "var(--line)",
            fontSize: 11,
            color: "var(--ink-3)",
            background: "var(--bg)",
          }}
        >
          Drag the grip handle to reorder. Click a slide to open the editor.
        </div>

        {/* Slide list (sortable) */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "12px 14px" }}>
          {slides.length === 0 ? (
            <div
              className="text-center"
              style={{
                padding: "32px 16px",
                border: "1px dashed var(--line-2)",
                borderRadius: 8,
                color: "var(--ink-3)",
                fontSize: 12.5,
                lineHeight: 1.5,
              }}
            >
              No slides yet. Advance to Stage 03 in the chat to draft the deck.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={slides.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1.5">
                  {slides.map((s) => (
                    <SortableSlideCard
                      key={s.id}
                      slide={s}
                      onClick={() => {
                        onClose();
                        router.push(`/v2/engagements/${projectId}/slides/${s.id}`);
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </aside>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// SortableSlideCard
// ────────────────────────────────────────────────────────────────

function SortableSlideCard({
  slide,
  onClick,
}: {
  slide: Slide;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  const typeLabel = SLIDE_TYPE_LABELS[slide.slide_type] ?? slide.slide_type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-stretch gap-2 transition-colors"
    >
      {/* Drag handle — separate so it doesn't capture clicks meant for the card */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing"
        style={{
          width: 24,
          background: "transparent",
          border: "1px solid var(--line)",
          borderRadius: 6,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-4)",
          padding: 0,
        }}
        aria-label={`Drag slide ${slide.position + 1}`}
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>

      {/* Card */}
      <button
        onClick={onClick}
        className="flex-1 text-left transition-colors hover:bg-black/[.02]"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "10px 12px",
          cursor: "pointer",
          color: "var(--ink)",
        }}
      >
        <div className="mb-1 flex items-center gap-2">
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "var(--ink-4)",
              letterSpacing: 0.6,
            }}
          >
            {String(slide.position + 1).padStart(2, "0")}
          </span>
          <Chip size="xs" tone="ghost">
            {typeLabel}
          </Chip>
        </div>
        <div
          style={{
            fontFamily: "var(--serif)",
            fontSize: 13.5,
            lineHeight: 1.3,
            letterSpacing: -0.1,
            color: "var(--ink)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {slide.action_title || "Untitled slide"}
        </div>
      </button>
    </div>
  );
}
