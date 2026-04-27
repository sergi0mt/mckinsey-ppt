"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search, Loader2, X, Plus, ChevronDown, ChevronRight,
  FileText, ExternalLink, Pencil, Save, AlertCircle,
  BookOpen, Target, Sparkles, CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type {
  ResearchState,
  ResearchPlan,
  ResearchStep,
  ResearchSource,
  ResearchBrief,
  BranchFinding,
} from "@/lib/types";

// ── Sub-tab button ──
function SubTab({
  active,
  label,
  icon: Icon,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
        active
          ? "bg-[#002960] text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`ml-0.5 text-[9px] px-1 rounded-full ${
            active ? "bg-white/20" : "bg-muted-foreground/15"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Priority badge ──
function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const colors = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${colors[priority]}`}>
      {priority}
    </span>
  );
}

// ── Quality badge ──
function QualityBadge({ tier }: { tier: "high" | "medium" | "low" | "standard" }) {
  const config = {
    high: { label: "HIGH-CRED", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    medium: { label: "MED-CRED", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    low: { label: "LOW-CRED", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    standard: { label: "STANDARD", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  };
  const c = config[tier];
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ── Plan View ──
function PlanView({
  plan,
  loading,
  executing,
  onGeneratePlan,
  onExecute,
}: {
  plan: ResearchPlan;
  loading: boolean;
  executing: boolean;
  onGeneratePlan: () => void;
  onExecute: () => void;
}) {
  const steps = plan.research_plan || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1.5 p-2 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-[10px] h-7"
          onClick={onGeneratePlan}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          Generate Plan
        </Button>
        <Button
          size="sm"
          className="flex-1 text-[10px] h-7"
          onClick={onExecute}
          disabled={executing || steps.length === 0}
        >
          {executing ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Search className="w-3 h-3 mr-1" />
          )}
          Run Research
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {steps.length === 0 && !loading && (
          <div className="text-center py-8">
            <Target className="w-6 h-6 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-[10px] text-muted-foreground">
              No research plan yet. Click "Generate Plan" to create one from your project context.
            </p>
          </div>
        )}
        {steps.map((step) => (
          <div
            key={step.id}
            className="border border-border rounded-md p-2 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start gap-1.5 mb-1">
              <PriorityBadge priority={step.priority} />
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                {step.branch}
              </Badge>
              <CircleDot className="w-3 h-3 ml-auto text-muted-foreground/40 shrink-0 mt-0.5" />
            </div>
            <p className="text-[11px] leading-snug text-foreground/80">{step.sub_question}</p>
            {step.search_queries.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {step.search_queries.slice(0, 2).map((q, i) => (
                  <span
                    key={i}
                    className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-full"
                  >
                    {q}
                  </span>
                ))}
                {step.search_queries.length > 2 && (
                  <span className="text-[9px] text-muted-foreground">
                    +{step.search_queries.length - 2} more
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {plan.estimated_searches !== undefined && (
        <div className="p-2 border-t border-border text-[10px] text-muted-foreground">
          Est. {plan.estimated_searches} searches
          {plan.key_data_gaps && plan.key_data_gaps.length > 0 && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              {plan.key_data_gaps.length} gap(s)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sources View ──
function SourcesView({
  sources,
  onRemove,
  onAddUrl,
}: {
  sources: ResearchSource[];
  onRemove: (idx: number) => void;
  onAddUrl: (url: string) => void;
}) {
  const [urlInput, setUrlInput] = useState("");

  const grouped = {
    high: sources.filter((s) => s.quality_tier === "high"),
    medium: sources.filter((s) => s.quality_tier === "medium"),
    low: sources.filter((s) => s.quality_tier === "low" || s.quality_tier === "standard"),
  };

  function extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  }

  function handleAdd() {
    if (!urlInput.trim()) return;
    onAddUrl(urlInput.trim());
    setUrlInput("");
  }

  function renderGroup(label: string, items: ResearchSource[], tier: "high" | "medium" | "low" | "standard") {
    if (items.length === 0) return null;
    return (
      <div key={label} className="mb-2">
        <div className="flex items-center gap-1.5 mb-1 px-1">
          <QualityBadge tier={tier} />
          <span className="text-[9px] text-muted-foreground">{items.length} source(s)</span>
        </div>
        <div className="space-y-1">
          {items.map((src, i) => {
            const globalIdx = sources.indexOf(src);
            return (
              <div
                key={i}
                className="group border border-border rounded-md p-2 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-1.5">
                  <FileText className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium leading-snug truncate">{src.title}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{extractDomain(src.url)}</p>
                  </div>
                  <button
                    onClick={() => onRemove(globalIdx)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
                {src.snippet && (
                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
                    {src.snippet}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border">
        <div className="flex gap-1">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Add source URL..."
            className="flex-1 text-[10px] px-2 py-1 bg-background border border-border rounded"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleAdd}
            disabled={!urlInput.trim()}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {sources.length === 0 && (
          <div className="text-center py-8">
            <BookOpen className="w-6 h-6 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-[10px] text-muted-foreground">
              No sources found yet. Run research or add URLs manually.
            </p>
          </div>
        )}
        {renderGroup("High Credibility", grouped.high, "high")}
        {renderGroup("Medium Credibility", grouped.medium, "medium")}
        {renderGroup("Low / Standard", grouped.low, "low")}
      </div>
    </div>
  );
}

// ── Brief View ──
function BriefView({
  brief,
  onSave,
}: {
  brief: ResearchBrief;
  onSave: (updated: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(brief.executive_summary || "");
  const [saving, setSaving] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEditText(brief.executive_summary || "");
  }, [brief.executive_summary]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ ...brief, executive_summary: editText });
      setEditing(false);
      toast.success("Brief saved");
    } catch {
      toast.error("Failed to save brief");
    }
    setSaving(false);
  }

  function toggleBranch(branch: string) {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  }

  const hasBrief = brief.executive_summary || (brief.findings_by_branch && brief.findings_by_branch.length > 0);

  return (
    <div className="flex flex-col h-full">
      {!hasBrief && (
        <div className="text-center py-8 px-2">
          <FileText className="w-6 h-6 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground">
            No research brief yet. Run research to generate findings.
          </p>
        </div>
      )}

      {hasBrief && (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
          {/* Executive Summary */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Executive Summary
              </span>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[9px] px-1.5"
                    onClick={() => {
                      setEditing(false);
                      setEditText(brief.executive_summary || "");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-5 text-[9px] px-1.5"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-0.5" />}
                    Save
                  </Button>
                </div>
              )}
            </div>
            {editing ? (
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={6}
                className="text-[11px]"
                placeholder="Write your executive summary..."
              />
            ) : (
              <div className="text-[11px] leading-relaxed text-foreground/80 prose-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {brief.executive_summary || ""}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Confidence & Stats */}
          {(brief.overall_confidence || brief.total_sources_used) && (
            <div className="flex gap-2">
              {brief.overall_confidence && (
                <Badge
                  variant={
                    brief.overall_confidence === "high"
                      ? "default"
                      : brief.overall_confidence === "medium"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-[9px]"
                >
                  Confidence: {brief.overall_confidence}
                </Badge>
              )}
              {brief.total_sources_used !== undefined && (
                <Badge variant="outline" className="text-[9px]">
                  {brief.total_sources_used} sources
                </Badge>
              )}
            </div>
          )}

          {/* Findings by branch */}
          {brief.findings_by_branch && brief.findings_by_branch.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Findings by Branch
              </span>
              <div className="space-y-1">
                {brief.findings_by_branch.map((bf: BranchFinding) => {
                  const expanded = expandedBranches.has(bf.branch);
                  return (
                    <div key={bf.branch} className="border border-border rounded-md overflow-hidden">
                      <button
                        onClick={() => toggleBranch(bf.branch)}
                        className="w-full flex items-center gap-1.5 p-2 text-[11px] font-medium hover:bg-muted transition-colors text-left"
                      >
                        {expanded ? (
                          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                        {bf.branch}
                        <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-4">
                          {bf.key_findings.length} finding(s)
                        </Badge>
                      </button>
                      {expanded && (
                        <div className="border-t border-border p-2 space-y-1.5">
                          {bf.key_findings.map((f, i) => (
                            <div
                              key={i}
                              className="text-[10px] leading-snug pl-2 border-l-2 border-[#0065BD]/30"
                            >
                              <p className="text-foreground/80">{f.finding}</p>
                              <p className="text-muted-foreground mt-0.5">
                                Source: {f.source} | Confidence: {f.confidence}
                              </p>
                            </div>
                          ))}
                          {bf.data_gaps.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-dashed border-border">
                              <p className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                                Data gaps:
                              </p>
                              {bf.data_gaps.map((gap, i) => (
                                <p key={i} className="text-[10px] text-muted-foreground pl-2">
                                  - {gap}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Strongest evidence */}
          {brief.strongest_evidence && brief.strongest_evidence.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                Strongest Evidence
              </span>
              <div className="space-y-1">
                {brief.strongest_evidence.map((ev, i) => (
                  <div key={i} className="text-[10px] text-foreground/80 pl-2 border-l-2 border-green-500/50 leading-snug">
                    {ev}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Gaps View ──
function GapsView({
  gaps,
  onFillGap,
}: {
  gaps: string[];
  onFillGap: (gap: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {gaps.length === 0 && (
          <div className="text-center py-8">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-[10px] text-muted-foreground">
              No data gaps identified. Generate a research plan first.
            </p>
          </div>
        )}
        {gaps.map((gap, i) => (
          <div
            key={i}
            className="border border-border rounded-md p-2.5 hover:border-amber-500/30 transition-colors"
          >
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-snug text-foreground/80 flex-1">{gap}</p>
            </div>
            <div className="mt-1.5 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-5 text-[9px] px-2"
                onClick={() => onFillGap(gap)}
              >
                <Search className="w-2.5 h-2.5 mr-0.5" />
                Fill Gap
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// ── Main Research Panel ──
// ══════════════════════════════════════════════

type ResearchTab = "plan" | "sources" | "brief" | "gaps";

export default function ResearchPanel({ projectId, refreshKey = 0 }: { projectId: string; refreshKey?: number }) {
  const [activeTab, setActiveTab] = useState<ResearchTab>("plan");
  const [research, setResearch] = useState<ResearchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [executing, setExecuting] = useState(false);

  // Load research state
  const loadResearch = useCallback(async () => {
    try {
      const data = await api.research.get(projectId);
      setResearch(data);
    } catch {
      // No research state yet — that's fine
      setResearch(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // FIX 7: Refresh when parent signals (e.g., after chat persists new research)
  useEffect(() => {
    loadResearch();
  }, [loadResearch, refreshKey]);

  // Generate plan
  async function handleGeneratePlan() {
    setPlanLoading(true);
    try {
      const plan = await api.research.generatePlan(projectId);
      setResearch((prev) =>
        prev
          ? { ...prev, research_plan: plan }
          : {
              id: crypto.randomUUID(),
              project_id: projectId,
              research_plan: plan,
              research_brief: {},
              sources: [],
              data_gaps: plan.key_data_gaps || [],
              status: "pending",
            }
      );
      toast.success("Research plan generated");
    } catch (err) {
      toast.error("Failed to generate plan: " + (err instanceof Error ? err.message : "Unknown error"));
    }
    setPlanLoading(false);
  }

  // Execute research
  async function handleExecute() {
    setExecuting(true);
    try {
      const res = await api.research.execute(projectId);
      if (!res.ok) throw new Error("Execution failed");
      toast.success("Research execution started");
      // Poll for updates
      const interval = setInterval(async () => {
        try {
          const data = await api.research.get(projectId);
          setResearch(data);
          if (data.status === "complete") {
            clearInterval(interval);
            setExecuting(false);
            toast.success("Research complete");
          }
        } catch {
          clearInterval(interval);
          setExecuting(false);
        }
      }, 3000);
      // Safety timeout
      setTimeout(() => {
        clearInterval(interval);
        setExecuting(false);
        loadResearch();
      }, 120000);
    } catch (err) {
      toast.error("Research failed: " + (err instanceof Error ? err.message : "Unknown error"));
      setExecuting(false);
    }
  }

  // Remove source
  async function handleRemoveSource(idx: number) {
    try {
      await api.research.removeSource(projectId, idx);
      setResearch((prev) =>
        prev
          ? { ...prev, sources: prev.sources.filter((_, i) => i !== idx) }
          : null
      );
    } catch {
      toast.error("Failed to remove source");
    }
  }

  // Add source by URL
  async function handleAddSource(url: string) {
    try {
      const src = await api.research.addSource(projectId, url);
      setResearch((prev) =>
        prev
          ? { ...prev, sources: [...prev.sources, src] }
          : null
      );
      toast.success("Source added");
    } catch {
      toast.error("Failed to add source");
    }
  }

  // Save brief
  async function handleSaveBrief(updated: Record<string, unknown>) {
    await api.research.updateBrief(projectId, updated);
    loadResearch();
  }

  // Fill gap placeholder
  function handleFillGap(gap: string) {
    toast("Targeted search for gap: " + gap.slice(0, 60) + "...", {
      description: "This feature will trigger a focused search for this data gap.",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const plan: ResearchPlan = research?.research_plan || {};
  const sources: ResearchSource[] = research?.sources || [];
  const brief: ResearchBrief = research?.research_brief || {};
  const gaps: string[] = research?.data_gaps || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 p-1.5 border-b border-border bg-card flex-wrap">
        <SubTab
          active={activeTab === "plan"}
          label="Plan"
          icon={Target}
          count={(plan.research_plan || []).length}
          onClick={() => setActiveTab("plan")}
        />
        <SubTab
          active={activeTab === "sources"}
          label="Sources"
          icon={BookOpen}
          count={sources.length}
          onClick={() => setActiveTab("sources")}
        />
        <SubTab
          active={activeTab === "brief"}
          label="Brief"
          icon={FileText}
          onClick={() => setActiveTab("brief")}
        />
        <SubTab
          active={activeTab === "gaps"}
          label="Gaps"
          icon={AlertCircle}
          count={gaps.length}
          onClick={() => setActiveTab("gaps")}
        />
      </div>

      {/* Status bar */}
      {research?.status && research.status !== "pending" && (
        <div className="px-2 py-1 border-b border-border bg-muted/50 flex items-center gap-1.5">
          {research.status === "in_progress" && (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-[#0065BD]" />
              <span className="text-[10px] text-[#0065BD] font-medium">Research in progress...</span>
            </>
          )}
          {research.status === "complete" && (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                Research complete
              </span>
            </>
          )}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "plan" && (
          <PlanView
            plan={plan}
            loading={planLoading}
            executing={executing}
            onGeneratePlan={handleGeneratePlan}
            onExecute={handleExecute}
          />
        )}
        {activeTab === "sources" && (
          <SourcesView
            sources={sources}
            onRemove={handleRemoveSource}
            onAddUrl={handleAddSource}
          />
        )}
        {activeTab === "brief" && (
          <BriefView brief={brief} onSave={handleSaveBrief} />
        )}
        {activeTab === "gaps" && (
          <GapsView gaps={gaps} onFillGap={handleFillGap} />
        )}
      </div>
    </div>
  );
}
