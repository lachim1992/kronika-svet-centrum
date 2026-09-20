import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureCitySettlementNodes } from "../_shared/citySettlementNodes.ts";
import { derivedChainSteps } from "../_shared/derivedChain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * refresh-economy: PURE DERIVED RECOMPUTE (Economy Integrity Pass, INVARIANT 2).
 *
 * MAY: rebuild routes, production, demand, markets, trade flows and derived
 *      aggregates (aggregate-realm-totals is read + sum only).
 * MUST NOT: collect taxes, pay upkeep, mutate gold_reserve, mutate legitimacy,
 *      apply transfers, run a player transaction, or append to any *_history,
 *      *_snapshot or event/action log table.
 *
 * Fiscal pillars (wealth_pop_tax, wealth_domestic_market, goods_wealth_fiscal)
 * are READ ONLY — they come from the last successful turn resolution.
 * Running it twice over the same state must produce identical derived state.
 */

interface StepResult {
  name: string;
  ok: boolean;
  durationMs: number;
  rowsWritten?: number;
  detail?: string;
}

const LOCK_TTL_MS = 5 * 60 * 1000;

async function invokeStep(
  supabaseUrl: string,
  serviceKey: string,
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        // Must match Authorization — mixing the anon key here returns 401 "Conflicting API keys".
        apikey: serviceKey,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok || data?.ok !== true || data?.error) {
      return { ok: false, error: data?.error || `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Network error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let lockedSession: string | null = null;
  let sb: any = null;

  try {
    const { session_id } = await req.json();
    if (!session_id) throw new Error("Missing session_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    sb = createClient(supabaseUrl, serviceKey);

    // ── Distributed lock (DB, with TTL) ─────────────────────────
    const { data: existingLock } = await sb.from("economy_recompute_locks")
      .select("session_id, locked_at")
      .eq("session_id", session_id)
      .maybeSingle();

    if (existingLock) {
      const age = Date.now() - new Date(existingLock.locked_at).getTime();
      if (age < LOCK_TTL_MS) {
        return new Response(
          JSON.stringify({ error: "already_in_progress", session_id, lock_age_ms: age }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 },
        );
      }
      // Stale lock → take it over
      await sb.from("economy_recompute_locks")
        .update({ locked_at: new Date().toISOString(), locked_by: "refresh-economy" })
        .eq("session_id", session_id);
    } else {
      const { error: lockErr } = await sb.from("economy_recompute_locks")
        .insert({ session_id, locked_by: "refresh-economy" });
      if (lockErr) {
        return new Response(
          JSON.stringify({ error: "already_in_progress", session_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 },
        );
      }
    }
    lockedSession = session_id;

    // ── PHYSICAL PREREQUISITE: every city is a settlement node ─────────────
    // Purely structural (no fiscal, no history). Cities without a node used to
    // vanish from trade flows, demand baskets and market summaries.
    const settlementNodes = await ensureCitySettlementNodes(sb, session_id);


    // ── Fiscal guard snapshot: these must be identical after the refresh ──
    const FISCAL_COLUMNS = "player_name, gold_reserve, production_reserve, legitimacy, wealth_pop_tax, wealth_domestic_market, goods_wealth_fiscal";
    const { data: fiscalBefore } = await sb.from("realm_resources")
      .select(FISCAL_COLUMNS)
      .eq("session_id", session_id);

    // Legacy province routes stay only for military/older overlays; economic
    // connectivity and goods movement derive from roads and rivers.
    //
    // Phase 5: the chain is defined once in _shared/derivedChain.ts and shared
    // with commit-turn. refresh-economy emits no events and never touches fiscal
    // state; the final aggregation here is read + sum only.
    const steps = derivedChainSteps({ sessionId: session_id });

    const results: StepResult[] = [];
    const warnings: string[] = [];

    for (const step of steps) {
      const t0 = Date.now();
      const res = await invokeStep(supabaseUrl, serviceKey, step.fn, step.body);
      const durationMs = Date.now() - t0;
      const rowsWritten = Number(
        res.data?.nodes_computed ?? res.data?.flows ?? res.data?.players ?? 0,
      );
      results.push({
        name: step.name,
        ok: res.ok,
        durationMs,
        rowsWritten,
        detail: res.ok ? JSON.stringify(res.data).slice(0, 300) : res.error,
      });
      console.log(`[refresh-economy] step=${step.name} ok=${res.ok} rows=${rowsWritten} ms=${durationMs}`);

      if (!res.ok) {
        console.error(`Step ${step.name} failed:`, res.error);
        warnings.push(`${step.name}: ${res.error}`);
        break;
      }
    }

    // ── Fiscal guard verification (INVARIANT 2) ───────────────
    const { data: fiscalAfter } = await sb.from("realm_resources")
      .select(FISCAL_COLUMNS)
      .eq("session_id", session_id);
    const fiscalKey = (rows: any[] | null) =>
      JSON.stringify((rows || []).slice().sort((a, b) => a.player_name.localeCompare(b.player_name)));
    const fiscalUnchanged = fiscalKey(fiscalBefore) === fiscalKey(fiscalAfter);
    if (!fiscalUnchanged) {
      console.error("[refresh-economy] FISCAL GUARD VIOLATION — a step mutated fiscal state");
      warnings.push("fiscal_guard_violation: a derived step mutated fiscal state");
    }

    const allOk = results.every((r) => r.ok) && fiscalUnchanged;
    const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

    return new Response(
      JSON.stringify({
        ok: allOk,
        session_id,
        totalMs,
        status: allOk ? "fresh" : "stale",
        fiscal_state: "read_only_from_last_turn_resolution",
        fiscal_unchanged: fiscalUnchanged,
        settlement_nodes: settlementNodes,
        refreshed_domains: ["settlements", "roads", "rivers", "flows", "production", "markets", "trade", "aggregates"],
        steps: results,
        warnings,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: allOk ? 200 : 500,
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message, status: "stale" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  } finally {
    if (lockedSession && sb) {
      try {
        await sb.from("economy_recompute_locks").delete().eq("session_id", lockedSession);
      } catch { /* lock expires via TTL */ }
    }
  }
});
