"use client";

import { useState } from "react";
import {
  FileText, Presentation, FileDown, Loader2, Download,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";

interface ExportFormat {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  extension: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "pptx",
    label: "PowerPoint Deck",
    description: "Full McKinsey-styled .pptx with charts and formatting",
    icon: Presentation,
    extension: ".pptx",
  },
  {
    id: "docx",
    label: "Executive Memo",
    description: "Word document with SCR framework, recommendations, and evidence",
    icon: FileText,
    extension: ".docx",
  },
  {
    id: "pdf_onepager",
    label: "One-Pager PDF",
    description: "Single-page executive summary with key findings",
    icon: FileDown,
    extension: ".pdf",
  },
];

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  hasSlides: boolean;
}

interface ExportResult {
  formatId: string;
  status: "pending" | "exporting" | "done" | "error";
  deliverableId?: string;
  error?: string;
}

export default function ExportDialog({ open, onOpenChange, projectId, hasSlides }: ExportDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["pptx"]));
  const [results, setResults] = useState<ExportResult[]>([]);
  const [exporting, setExporting] = useState(false);

  function toggleFormat(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExport() {
    if (selected.size === 0) return;
    setExporting(true);
    const formats = Array.from(selected);

    // Initialize results
    setResults(formats.map((f) => ({ formatId: f, status: "pending" })));

    for (const formatId of formats) {
      // Update to exporting
      setResults((prev) =>
        prev.map((r) => (r.formatId === formatId ? { ...r, status: "exporting" } : r))
      );

      try {
        const result = await api.exports.generate(projectId, formatId);
        setResults((prev) =>
          prev.map((r) =>
            r.formatId === formatId
              ? { ...r, status: "done", deliverableId: result.id }
              : r
          )
        );
        const format = EXPORT_FORMATS.find((f) => f.id === formatId);
        toast.success(`${format?.label || formatId} exported!`);
      } catch (err) {
        setResults((prev) =>
          prev.map((r) =>
            r.formatId === formatId
              ? { ...r, status: "error", error: err instanceof Error ? err.message : "Failed" }
              : r
          )
        );
        toast.error(`Export failed: ${formatId}`);
      }
    }

    setExporting(false);
  }

  function handleClose() {
    if (!exporting) {
      setResults([]);
      onOpenChange(false);
    }
  }

  const hasResults = results.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Export Project</DialogTitle>
        </DialogHeader>

        {!hasResults ? (
          <>
            <p className="text-xs text-muted-foreground -mt-2">
              Select one or more output formats to generate.
            </p>
            <div className="space-y-2">
              {EXPORT_FORMATS.map((format) => {
                const isSelected = selected.has(format.id);
                const Icon = format.icon;
                return (
                  <button
                    key={format.id}
                    onClick={() => toggleFormat(format.id)}
                    disabled={!hasSlides && format.id !== "pdf_onepager"}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? "border-[#0065BD] bg-[#0065BD]/5"
                        : "border-border hover:border-muted-foreground/30"
                    } ${!hasSlides && format.id !== "pdf_onepager" ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? "bg-[#0065BD]/10" : "bg-muted"
                    }`}>
                      <Icon className={`w-4 h-4 ${isSelected ? "text-[#0065BD]" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{format.label}</span>
                        <span className="text-[10px] text-muted-foreground">{format.extension}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                        {format.description}
                      </p>
                    </div>
                    <div className={`w-4 h-4 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                      isSelected ? "border-[#0065BD] bg-[#0065BD]" : "border-muted-foreground/30"
                    }`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <DialogFooter>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={selected.size === 0 || exporting}
                className="gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" />
                Export {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {results.map((result) => {
                const format = EXPORT_FORMATS.find((f) => f.id === result.formatId);
                if (!format) return null;
                const Icon = format.icon;
                return (
                  <div key={result.formatId} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold">{format.label}</span>
                      {result.status === "error" && (
                        <p className="text-[10px] text-destructive">{result.error}</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {result.status === "pending" && (
                        <span className="text-[10px] text-muted-foreground">Waiting...</span>
                      )}
                      {result.status === "exporting" && (
                        <Loader2 className="w-4 h-4 animate-spin text-[#0065BD]" />
                      )}
                      {result.status === "done" && result.deliverableId && (
                        <a
                          href={api.exports.downloadUrl(result.deliverableId)}
                          className="flex items-center gap-1 text-[11px] text-[#0065BD] hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </a>
                      )}
                      {result.status === "error" && (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={handleClose} disabled={exporting}>
                Close
              </Button>
              {!exporting && results.some((r) => r.status === "error") && (
                <Button size="sm" onClick={handleExport} className="gap-1.5">
                  <FileDown className="w-3.5 h-3.5" /> Retry Failed
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
