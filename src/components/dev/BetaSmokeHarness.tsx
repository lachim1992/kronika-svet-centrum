// ============================================================================
// BetaSmokeHarness — Dev-only 30-turn observability harness.
//
// Purpose: validate the canonical loop (commit-turn → refresh-economy →
// re-fetch → adapter view-model) end-to-end without engaging player UI.
// On the FIRST failure, snapshots enough context to reproduce the bug
// without replaying the whole sequence.
//
// Not a CI tool. Not mocked. Hits the real edge functions and DB.
// See docs/BETA_SCOPE.md → Smoke validation.
// ============================================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adaptRealmResourceToRows, adaptMilitaryStacks } from "@/lib/empireOverviewAdapter";

interface Props {
  sessionId: string;
  currentPlayerName: string;
}

type InvariantResult = { name: string; ok: boolean; warn?: boolean; detail?: string };

interface TurnReport {
  turn: number;
  results: InvariantResult[];
  failed: boolean;
  warned: boolean;
  durationMs: number;
}

interface FailureContext {
  turn_number: number;
  player_name: string;
  session_id: string;
  realm_resources_row_id: string | null;
  realm_resources_row_count: number;
  stack: string;
}

const RESERVE_KEYS = [
  "gold_reserve", "grain_reserve", "wood_reserve",
  "stone_reserve", "iron_reserve", "horses_reserve", "labor_reserve",
] as const;

const BetaSmokeHarness = ({ sessionId, currentPlayerName }: Props) => {
  const [running, setRunning] = useState(false);
  const [turnCount, setTurnCount] = useState(30);
  const [reports, setReports] = useState<TurnReport[]>([]);
  const [failure, setFailure] = useState<FailureContext | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setReports([]);
    setFailure(null);
    setDone(false);
  };

  const fetchSnapshot = async () => {
    const [sessRes, rrRes, msRes, chrRes, evtRes] = await Promise.all([
      supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single(),
      supabase.from("realm_resources").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName),
      supabase.from("military_stacks").select("*").eq("session_id", sessionId),
      supabase.from("chronicle_entries").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
      supabase.from("game_events").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    ]);
    return {
      currentTurn: (sessRes.data as any)?.current_turn ?? null,
      realmRows: rrRes.data ?? [],
      stacks: msRes.data ?? [],
      chronicleCount: chrRes.count ?? 0,
      eventCount: evtRes.count ?? 0,
    };
  };

  const runOneTurn = async (idx: number, prev: any): Promise<TurnReport> => {
    const start = performance.now();
    const results: InvariantResult[] = [];

    // 1. commit-turn
    let commitOk = false;
    try {
      const { data, error } = await supabase.functions.invoke("commit-turn", {
        body: { sessionId, playerName: currentPlayerName, skipNarrative: true },
      });
      if (error) throw new Error(error.message || "commit-turn failed");
      commitOk = true;
      results.push({ name: "commit-turn", ok: true });
    } catch (e: any) {
      results.push({ name: "commit-turn", ok: false, detail: e.message });
    }

    // 2. refresh-economy
    let refreshSteps: any[] = [];
    if (commitOk) {
      try {
        const { data, error } = await supabase.functions.invoke("refresh-economy", {
          body: { session_id: sessionId },
        });
        if (error) throw new Error(error.message || "refresh-economy failed");
        refreshSteps = (data as any)?.steps ?? [];
        const failed = refreshSteps.filter((s: any) => !s.ok);
        results.push({
          name: "refresh-economy",
          ok: failed.length === 0,
          detail: failed.length > 0 ? `${failed.length} step(s) failed` : `${refreshSteps.length} steps ok`,
        });
      } catch (e: any) {
        results.push({ name: "refresh-economy", ok: false, detail: e.message });
      }
    } else {
      results.push({ name: "refresh-economy", ok: false, detail: "skipped (commit failed)" });
    }

    // 3. re-fetch snapshot
    const snap = await fetchSnapshot();

    // 4. invariants

    // session loads
    results.push({
      name: "session loads",
      ok: snap.currentTurn !== null,
      detail: `current_turn=${snap.currentTurn}`,
    });

    // unique realm_resources row
    results.push({
      name: "unique realm_resources row",
      ok: snap.realmRows.length === 1,
      detail: `count=${snap.realmRows.length}`,
    });

    const realmRow = snap.realmRows[0] ?? null;

    // adapter validity
    const adapterRows = adaptRealmResourceToRows(realmRow);
    const adapterMil = adaptMilitaryStacks(snap.stacks, currentPlayerName);
    const nanFound = adapterRows.some(r =>
      Number.isNaN(r.stockpile) ||
      (r.income !== undefined && Number.isNaN(r.income)) ||
      (r.upkeep !== undefined && Number.isNaN(r.upkeep))
    ) || Number.isNaN(adapterMil.active) || Number.isNaN(adapterMil.total);
    results.push({
      name: "adapter view-model",
      ok: !nanFound,
      detail: nanFound ? "NaN detected" : `${adapterRows.length} rows, mil ${adapterMil.active}/${adapterMil.total}`,
    });

    // chronicle monotonicity
    if (prev) {
      results.push({
        name: "chronicle monotonic",
        ok: snap.chronicleCount >= prev.chronicleCount,
        detail: `${prev.chronicleCount} → ${snap.chronicleCount}`,
      });
      // turn monotonicity
      results.push({
        name: "turn monotonicity",
        ok: snap.currentTurn === prev.currentTurn + 1,
        detail: `${prev.currentTurn} → ${snap.currentTurn} (expected +1)`,
      });
    }

    // legacy compat does not throw
    try {
      await Promise.all([
        supabase.from("player_resources").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("military_capacity").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("trade_log").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
      ]);
      results.push({ name: "fetchLegacyCompat", ok: true });
    } catch (e: any) {
      results.push({ name: "fetchLegacyCompat", ok: false, detail: e.message });
    }

    // reserve sanity
    if (realmRow) {
      const negatives = RESERVE_KEYS.filter(k => {
        const v = (realmRow as any)[k];
        return typeof v === "number" && v < 0;
      });
      if (negatives.length > 0) {
        results.push({
          name: "reserve sanity",
          ok: true,
          warn: true,
          detail: `negative: ${negatives.join(", ")}`,
        });
      } else {
        results.push({ name: "reserve sanity", ok: true });
      }
    } else {
      results.push({
        name: "reserve sanity",
        ok: false,
        detail: "no realm_resources row",
      });
    }

    const failed = results.some(r => !r.ok);
    const warned = results.some(r => r.warn);

    return {
      turn: idx,
      results,
      failed,
      warned,
      durationMs: Math.round(performance.now() - start),
    };
  };

  const handleRun = async () => {
    reset();
    setRunning(true);
    try {
      let prev = await fetchSnapshot();
      const collected: TurnReport[] = [];
      for (let i = 1; i <= turnCount; i++) {
        const report = await runOneTurn(i, prev);
        collected.push(report);
        setReports([...collected]);
        if (report.failed) {
          // snapshot failure context for reproduction
          const ctx = await fetchSnapshot();
          const firstFail = report.results.find(r => !r.ok);
          setFailure({
            turn_number: ctx.currentTurn ?? i,
            player_name: currentPlayerName,
            session_id: sessionId,
            realm_resources_row_id: ctx.realmRows[0]?.id ?? null,
            realm_resources_row_count: ctx.realmRows.length,
            stack: `${firstFail?.name}: ${firstFail?.detail ?? "(no detail)"}`,
          });
          break;
        }
        prev = await fetchSnapshot();
      }
      setDone(true);
    } finally {
      setRunning(false);
    }
  };

  const passCount = reports.filter(r => !r.failed).length;
  const warnCount = reports.filter(r => r.warned && !r.failed).length;

  return (
    <div className="manuscript-card p-4 space-y-3 border-dashed">
      <div className="flex items-center gap-2">
        <h3 className="font-display font-semibold text-sm">🧪 Beta Smoke Harness</h3>
        <Badge variant="outline" className="text-[10px]">dev-only</Badge>
        <span className="text-xs text-muted-foreground ml-auto">30-turn canonical loop</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Runs commit-turn → refresh-economy → re-fetch → invariants. On first failure,
        snapshots context for reproduction. See <code>docs/BETA_SCOPE.md</code>.
      </p>

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Turns:</label>
        <input
          type="number"
          min={1}
          max={100}
          value={turnCount}
          onChange={e => setTurnCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 30)))}
          className="w-16 px-2 py-1 text-xs bg-background border border-border rounded"
          disabled={running}
        />
        <Button size="sm" onClick={handleRun} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run smoke
        </Button>
        {done && (
          <Badge variant={failure ? "destructive" : "secondary"} className="text-xs ml-auto">
            {passCount}/{reports.length} ok{warnCount > 0 ? ` · ${warnCount} warn` : ""}
          </Badge>
        )}
      </div>

      {failure && (
        <div className="p-3 rounded border border-destructive/40 bg-destructive/5 space-y-1">
          <div className="flex items-center gap-2 text-destructive text-xs font-semibold">
            <XCircle className="h-3.5 w-3.5" />
            Failure context (reproduce without replay)
          </div>
          <pre className="text-[10px] text-foreground whitespace-pre-wrap font-mono">
{JSON.stringify(failure, null, 2)}
          </pre>
        </div>
      )}

      {reports.length > 0 && (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {reports.map(r => (
            <div
              key={r.turn}
              className={`p-2 rounded text-xs border ${
                r.failed
                  ? "border-destructive/40 bg-destructive/5"
                  : r.warned
                  ? "border-yellow-500/40 bg-yellow-500/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {r.failed ? (
                  <XCircle className="h-3 w-3 text-destructive" />
                ) : r.warned ? (
                  <AlertTriangle className="h-3 w-3 text-yellow-600" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-forest-green" />
                )}
                Turn {r.turn}
                <span className="text-muted-foreground font-normal ml-auto">{r.durationMs}ms</span>
              </div>
              <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                {r.results.map((res, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span
                      className={
                        !res.ok
                          ? "text-destructive"
                          : res.warn
                          ? "text-yellow-600"
                          : "text-muted-foreground"
                      }
                    >
                      {!res.ok ? "✗" : res.warn ? "⚠" : "✓"}
                    </span>
                    <span className="truncate">
                      {res.name}
                      {res.detail && <span className="text-muted-foreground"> — {res.detail}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BetaSmokeHarness;
