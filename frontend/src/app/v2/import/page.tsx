"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Upload, AlertTriangle, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ImportResult } from "@/lib/types";
import { Chip, Logo } from "@/lib/v2/primitives";

const ACCEPTED = ".md,.markdown,.pdf,.docx,.txt";
const MAX_BYTES = 10 * 1024 * 1024;

const PROGRESS_STEPS = [
  "Reading file…",
  "Parsing markdown structure…",
  "Inferring engagement metadata with gemini-3.1-pro…",
  "Creating project & session…",
];

export default function ImportPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    if (!f) return;
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (![".md", ".markdown", ".pdf", ".docx", ".txt"].includes(ext)) {
      toast.error(`Unsupported file type ${ext}. Use .md, .pdf, .docx, or .txt`);
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`);
      return;
    }
    setFile(f);
    setError(null);
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  }, []);

  const startImport = async () => {
    if (!file) return;
    setStatus("uploading");
    setStepIdx(0);
    setError(null);

    // Tick through progress messages so the user sees activity during the LLM call
    const tickInterval = window.setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, PROGRESS_STEPS.length - 1));
    }, 2500);

    try {
      const res: ImportResult = await api.importReport.upload(file);
      window.clearInterval(tickInterval);
      setStatus("done");
      // Stash inferred result so the confirmation form can read it without a refetch
      try {
        sessionStorage.setItem(
          `mckinsey-ppt:import:${res.project_id}`,
          JSON.stringify(res),
        );
      } catch {
        // If sessionStorage is full or blocked, the form will fall back to API
      }
      router.push(`/v2/engagements/${res.project_id}/import`);
    } catch (err) {
      window.clearInterval(tickInterval);
      const msg = err instanceof Error ? err.message : "Import failed";
      setStatus("error");
      setError(msg);
      toast.error(msg);
    }
  };

  const fileSizeKb = file ? (file.size / 1024).toFixed(1) : "";

  return (
    <div className="flex h-screen w-full flex-col">
      {/* Top bar */}
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
          <span style={{ fontFamily: "var(--serif)", fontSize: 14 }}>Import report</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 32px 80px" }}>
          <div className="v2-kicker mb-2">RESEARCH HANDOFF</div>
          <h1
            className="m-0"
            style={{
              fontFamily: "var(--serif)",
              fontSize: 40,
              letterSpacing: -0.8,
              lineHeight: 1.1,
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            Subí el informe de deepresearch
          </h1>
          <p className="mt-3" style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.55, maxWidth: 600 }}>
            Aceptamos <code style={{ background: "var(--bg)", padding: "1px 6px", borderRadius: 4 }}>.md</code>,{" "}
            <code style={{ background: "var(--bg)", padding: "1px 6px", borderRadius: 4 }}>.pdf</code> y{" "}
            <code style={{ background: "var(--bg)", padding: "1px 6px", borderRadius: 4 }}>.docx</code>. Inferimos automáticamente
            audiencia, decisión y central question con gemini-3.1-pro, y vas a poder confirmar todo en el siguiente paso.
          </p>

          {/* Dropzone */}
          {status !== "uploading" && (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              style={{
                marginTop: 32,
                padding: "44px 32px",
                border: `2px dashed ${dragOver ? "var(--accent)" : "var(--line-2)"}`,
                borderRadius: 10,
                background: dragOver ? "var(--accent-soft)" : "var(--paper)",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                style={{ display: "none" }}
              />
              <div className="mb-3 inline-flex items-center justify-center" style={{
                width: 52, height: 52, borderRadius: 999,
                background: "var(--bg)", border: "1px solid var(--line)",
              }}>
                {file ? (
                  <FileCheck2 className="h-[22px] w-[22px]" strokeWidth={1.5} style={{ color: "var(--success)" }} />
                ) : (
                  <Upload className="h-[22px] w-[22px]" strokeWidth={1.5} style={{ color: "var(--ink-2)" }} />
                )}
              </div>
              {file ? (
                <>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink)" }}>{file.name}</div>
                  <div className="mt-1" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {fileSizeKb} KB · click para cambiar archivo
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--ink)" }}>
                    Click o arrastrá un archivo
                  </div>
                  <div className="mt-1" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    .md / .pdf / .docx · máx 10 MB
                  </div>
                </>
              )}
            </div>
          )}

          {/* Action button */}
          {status === "idle" && file && (
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={startImport}
                className="inline-flex items-center gap-2 transition-opacity hover:opacity-90"
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
                Import & infer metadata
              </button>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                ~5–15s — gemini-3.1-pro analiza título, exec summary y conclusiones
              </span>
            </div>
          )}

          {/* Progress */}
          {status === "uploading" && (
            <div
              className="mt-8"
              style={{
                padding: "24px 28px",
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: "var(--paper)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <Loader2 className="h-[16px] w-[16px] animate-spin" strokeWidth={1.5} style={{ color: "var(--accent)" }} />
                <Chip size="xs" tone="accent">Importing</Chip>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{file?.name}</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {PROGRESS_STEPS.map((s, i) => {
                  const state = i < stepIdx ? "done" : i === stepIdx ? "active" : "pending";
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-2.5"
                      style={{
                        padding: "8px 0",
                        fontSize: 13,
                        color: state === "pending" ? "var(--ink-4)" : state === "active" ? "var(--ink)" : "var(--ink-3)",
                      }}
                    >
                      <span style={{
                        display: "inline-block", width: 8, height: 8, borderRadius: 999,
                        background: state === "done" ? "var(--success)" : state === "active" ? "var(--accent)" : "var(--line-2)",
                      }} />
                      {s}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Error */}
          {status === "error" && error && (
            <div
              className="mt-6 flex items-start gap-3"
              style={{
                padding: "16px 18px",
                border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)",
                borderRadius: 8,
                background: "color-mix(in oklch, var(--danger) 8%, transparent)",
              }}
            >
              <AlertTriangle className="h-[16px] w-[16px] mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                  El import falló
                </div>
                <div className="mt-1" style={{ fontSize: 12, color: "var(--ink-3)" }}>{error}</div>
                <button
                  onClick={() => { setStatus("idle"); setError(null); }}
                  className="mt-3 underline"
                  style={{ background: "transparent", border: "none", color: "var(--ink-2)", fontSize: 12, cursor: "pointer", padding: 0 }}
                >
                  Probar de nuevo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
