const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * refresh-economy: Safe 4-step economy recalculation without process-turn.
 *
 * Pipeline:
 * 1. compute-province-routes  (rebuild routes; player_built protected)
 * 2. compute-hex-flows         (force_all: true)
 * 3. compute-trade-systems     (BFS components + access projection from treaties)
 * 4. compute-trade-flows       (goods pipeline; consumes trade systems & access)
 * 5. compute-economy-flow      (final realm_resources aggregation)
 *
 * No side effects on turn state. Best-effort in-memory per-session guard.
 */

interface StepResult {
  name: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

// Best-effort in-memory guard — not a distributed lock
const inProgress = new Set<string>();

async function invokeStep(
  supabaseUrl: string,
  anonKey: string,
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
        apikey: anonKey,
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
    if (!res.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) throw new Error("Missing session_id");

    // Best-effort concurrency guard
    if (inProgress.has(session_id)) {
      return new Response(
        JSON.stringify({ error: "already_in_progress", session_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 },
      );
    }

    inProgress.add(session_id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ORDER MATTERS (Phase A fix): compute-economy-flow performs the FINAL
    // aggregation of total_wealth & total_capacity into realm_resources by
    // reading wealth components produced by compute-trade-flows. It must run
    // LAST so it sees the freshest pop_tax / domestic_market / route_commerce
    // / fiscal-goods values; otherwise the canonical totals lag one cycle.
    const steps: { name: string; fn: string; body: Record<string, unknown> }[] = [
      { name: "compute-province-routes", fn: "compute-province-routes", body: { session_id } },
      { name: "compute-hex-flows", fn: "compute-hex-flows", body: { session_id, force_all: true } },
      // Node-Trade v1: project trade systems & player access BEFORE the goods solver consumes them
      { name: "compute-trade-systems", fn: "compute-trade-systems", body: { session_id } },
      { name: "compute-trade-flows", fn: "compute-trade-flows", body: { session_id } },
      { name: "compute-economy-flow", fn: "compute-economy-flow", body: { session_id } },
    ];

    const results: StepResult[] = [];
    const warnings: string[] = [];

    for (const step of steps) {
      const t0 = Date.now();
      const res = await invokeStep(supabaseUrl, anonKey, serviceKey, step.fn, step.body);
      const durationMs = Date.now() - t0;
      results.push({
        name: step.name,
        ok: res.ok,
        durationMs,
        detail: res.ok ? JSON.stringify(res.data).slice(0, 300) : res.error,
      });

      if (!res.ok) {
        console.error(`Step ${step.name} failed:`, res.error);
        warnings.push(`${step.name}: ${res.error}`);
      }
    }

    inProgress.delete(session_id);

    const allOk = results.every((r) => r.ok);
    const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

    return new Response(
      JSON.stringify({
        ok: allOk,
        session_id,
        totalMs,
        refreshed_domains: ["routes", "flows", "economy", "trade"],
        steps: results,
        warnings,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: allOk ? 200 : 207,
      },
    );
  } catch (e: any) {
    // Clean up guard on error
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.session_id) inProgress.delete(body.session_id);
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
