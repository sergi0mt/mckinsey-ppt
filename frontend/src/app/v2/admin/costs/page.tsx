"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Chip, Logo } from "@/lib/v2/primitives";

// ────────────────────────────────────────────────────────────────
// Types — backend exposes /api/v1/costs returning a CostTracker summary
// ────────────────────────────────────────────────────────────────

type CostCall = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms?: number;
  task?: string;
  stage?: string | number;
};

type CostSummary = {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  num_calls: number;
  calls: CostCall[];
};

// ────────────────────────────────────────────────────────────────
// Cost dashboard
// ────────────────────────────────────────────────────────────────

export default function CostDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function fetchOnce() {
      return fetch("/api/v1/costs")
        .then((r) => r.json() as Promise<CostSummary>)
        .then((data) => {
          if (!cancelled) setSummary(data);
        })
        .catch(() => {});
    }

    // Initial fetch unblocks the loading spinner; subsequent ticks just refresh.
    fetchOnce().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const id = window.setInterval(fetchOnce, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Aggregate by model + by stage
  const byModel = aggregateByKey(summary?.calls ?? [], (c) => c.model);
  const byStage = aggregateByKey(summary?.calls ?? [], (c) => String(c.stage ?? c.task ?? "?"));

  const totalCost = summary?.total_cost_usd ?? 0;
  const totalTokens = (summary?.total_input_tokens ?? 0) + (summary?.total_output_tokens ?? 0);
  const avgPerCall = summary?.num_calls ? totalCost / summary.num_calls : 0;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between border-b"
        style={{ padding: "12px 24px", borderColor: "var(--line)", background: "var(--paper)" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/v2")} className="v2-ghost-btn">
            <ArrowLeft className="h-[13px] w-[13px]" strokeWidth={1.5} />
            Engagements
          </button>
          <Logo size={14} />
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <span style={{ fontSize: 13 }}>Cost dashboard</span>
        </div>
        <div className="flex gap-1.5">
          <Chip tone="ghost">This session</Chip>
          <button className="v2-outline-btn" onClick={() => downloadCsv(summary)}>
            <Download className="h-[13px] w-[13px]" strokeWidth={1.5} />
            CSV
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto" style={{ padding: "32px 44px" }}>
        {loading ? (
          <div className="flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span style={{ fontSize: 13 }}>Loading cost data…</span>
          </div>
        ) : (
          <>
            {/* ── Big stats ────────────────────────────── */}
            <div className="mb-8 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <BigStat
                label="Total this session"
                value={formatUsd(totalCost)}
                sub={`${summary?.num_calls ?? 0} calls`}
              />
              <BigStat
                label="Avg cost / call"
                value={formatUsd(avgPerCall)}
                sub="across all models"
              />
              <BigStat
                label="Tokens consumed"
                value={formatTokens(totalTokens)}
                sub={`ctx ${formatTokens(summary?.total_input_tokens ?? 0)} · gen ${formatTokens(summary?.total_output_tokens ?? 0)}`}
              />
            </div>

            {/* ── 2-column: by model + by stage ────────────── */}
            <div className="mb-8 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {/* By model */}
              <div
                style={{
                  padding: "20px 24px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                <div className="v2-kicker mb-3.5" style={{ fontSize: 10, letterSpacing: 1.2 }}>
                  BY MODEL
                </div>
                {byModel.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>No calls yet.</div>
                )}
                {byModel.map((m, i) => {
                  const colors = ["var(--accent)", "var(--success)", "var(--warn)", "var(--ink-3)", "var(--danger)"];
                  return (
                    <div key={i} className="mb-2.5">
                      <div
                        className="mb-1 flex justify-between"
                        style={{ fontSize: 12 }}
                      >
                        <span style={{ fontFamily: "var(--mono)" }}>{m.key}</span>
                        <span style={{ color: "var(--ink-3)" }}>
                          {m.pct.toFixed(0)}% · {formatUsd(m.totalCost)}
                        </span>
                      </div>
                      <div
                        className="overflow-hidden"
                        style={{ height: 4, background: "var(--line)", borderRadius: 2 }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${m.pct}%`,
                            background: colors[i % colors.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* By stage */}
              <div
                style={{
                  padding: "20px 24px",
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                <div className="v2-kicker mb-3.5" style={{ fontSize: 10, letterSpacing: 1.2 }}>
                  BY STAGE / TASK
                </div>
                {byStage.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>No calls yet.</div>
                ) : (
                  <div
                    className="flex items-end gap-3"
                    style={{ height: 140 }}
                  >
                    {byStage.slice(0, 6).map((s, i) => {
                      const heightPct = Math.max(8, (s.totalCost / Math.max(...byStage.map((x) => x.totalCost), 0.001)) * 100);
                      return (
                        <div
                          key={i}
                          className="flex flex-1 flex-col items-center gap-1.5"
                        >
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 10,
                              color: "var(--ink-2)",
                            }}
                          >
                            {formatUsd(s.totalCost)}
                          </span>
                          <div
                            className="w-full"
                            style={{
                              height: `${heightPct}%`,
                              background:
                                i === byStage.findIndex((x) => x.totalCost === Math.max(...byStage.map((x) => x.totalCost)))
                                  ? "var(--accent)"
                                  : "var(--ink-2)",
                              borderRadius: "3px 3px 0 0",
                            }}
                          />
                          <span
                            className="truncate"
                            style={{
                              fontSize: 10,
                              color: "var(--ink-3)",
                              fontFamily: "var(--mono)",
                              maxWidth: "100%",
                            }}
                            title={s.key}
                          >
                            {truncate(s.key, 12)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Recent calls table ──────────────────────── */}
            <div
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                className="flex items-baseline gap-3 border-b"
                style={{ padding: "14px 20px", borderColor: "var(--line)" }}
              >
                <span style={{ fontFamily: "var(--serif)", fontSize: 17 }}>Recent calls</span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--ink-3)",
                    fontFamily: "var(--mono)",
                  }}
                >
                  last {Math.min(20, summary?.calls.length ?? 0)} of {summary?.calls.length ?? 0}
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      color: "var(--ink-3)",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    <th style={{ padding: "8px 16px", textAlign: "left" }}>Model</th>
                    <th style={{ padding: "8px 16px", textAlign: "right" }}>Input tok</th>
                    <th style={{ padding: "8px 16px", textAlign: "right" }}>Output tok</th>
                    <th style={{ padding: "8px 16px", textAlign: "right" }}>Duration</th>
                    <th style={{ padding: "8px 16px", textAlign: "right" }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.calls ?? []).slice(-20).reverse().map((c, i) => (
                    <tr
                      key={i}
                      style={{ borderTop: "1px solid var(--line)" }}
                    >
                      <td
                        style={{
                          padding: "10px 16px",
                          fontFamily: "var(--mono)",
                          fontSize: 11.5,
                          color: "var(--ink-2)",
                        }}
                      >
                        {c.model}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          textAlign: "right",
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                        }}
                      >
                        {formatTokens(c.input_tokens)}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          textAlign: "right",
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                        }}
                      >
                        {formatTokens(c.output_tokens)}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          textAlign: "right",
                          fontSize: 12.5,
                          color: "var(--ink-3)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {c.duration_ms ? `${Math.round(c.duration_ms)}ms` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          textAlign: "right",
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {formatUsd(c.cost_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

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
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// BigStat
// ────────────────────────────────────────────────────────────────

function BigStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        padding: "20px 24px",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: 1.2,
          color: "var(--ink-3)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        className="m-0"
        style={{
          fontFamily: "var(--serif)",
          fontSize: 38,
          letterSpacing: -0.8,
          lineHeight: 1.1,
          marginTop: 6,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function aggregateByKey(
  calls: CostCall[],
  keyFn: (c: CostCall) => string,
): { key: string; totalCost: number; pct: number; count: number }[] {
  const totals = new Map<string, { cost: number; count: number }>();
  let grand = 0;
  for (const c of calls) {
    const k = keyFn(c);
    const prev = totals.get(k) ?? { cost: 0, count: 0 };
    prev.cost += c.cost_usd;
    prev.count += 1;
    totals.set(k, prev);
    grand += c.cost_usd;
  }
  const out = Array.from(totals.entries()).map(([k, v]) => ({
    key: k,
    totalCost: v.cost,
    pct: grand > 0 ? (v.cost / grand) * 100 : 0,
    count: v.count,
  }));
  out.sort((a, b) => b.totalCost - a.totalCost);
  return out;
}

function formatUsd(v: number): string {
  return `$${v.toFixed(v < 0.01 ? 4 : 2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function downloadCsv(summary: CostSummary | null) {
  if (!summary) return;
  const rows = [
    ["model", "input_tokens", "output_tokens", "cost_usd", "duration_ms"],
    ...summary.calls.map((c) => [
      c.model,
      String(c.input_tokens),
      String(c.output_tokens),
      String(c.cost_usd),
      String(c.duration_ms ?? ""),
    ]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `costs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
