// ============================================================================
// recompute-all — BACK-COMPAT ADAPTER (NOT canonical orchestrator).
//
// Purpose:
//   Preserve the legacy DevTab contract `{ ok, totalMs, steps: [{ step, ok,
//   durationMs, detail }] }` while delegating all real work to the canonical
//   orchestrator `refresh-economy`. Optionally appends a `process-turn`
//   (recalcOnly) step when a `playerName` is provided.
//
// Discipline (do not violate):
//   - Boundary layer only: delegate → adapt response → optional process-turn.
//   - NO business logic, NO custom step list, NO recomputation here.
//   - Top-level `ok` derives ONLY from real steps (refresh + process-turn).
//     The synthetic "warnings" step MUST NOT mask a failure of a real step.
//
// Canonical entrypoint for new callers: `refresh-economy`
//   (snake_case `session_id`, returns `{ ok, session_id, totalMs,
//    refreshed_domains, steps: [{ name, ... }], warnings }`).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AdaptedStep {
  step: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

function safeStringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

async function invokeFn(
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${supabaseUrl}/functions/v1/${fn}`;
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
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message || "Network error" } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName } = await req.json();
    if (!sessionId) throw new Error("Missing sessionId");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── 1. Delegate to canonical orchestrator ──
    const refreshRes = await invokeFn(
      supabaseUrl, anonKey, serviceKey,
      "refresh-economy",
      { session_id: sessionId },
    );

    // ── 2. Defensive adaptation: { name, ... } → { step, ... } ──
    const refreshSteps: AdaptedStep[] = [];
    const rawSteps = refreshRes.data?.steps;
    if (Array.isArray(rawSteps)) {
      for (const s of rawSteps) {
        refreshSteps.push({
          step: typeof s?.name === "string" ? s.name : "(unnamed step)",
          ok: Boolean(s?.ok),
          durationMs: Number.isFinite(s?.durationMs) ? Number(s.durationMs) : 0,
          detail: safeStringify(s?.detail),
        });
      }
    } else {
      // refresh-economy returned no steps → treat whole call as a single failed step
      refreshSteps.push({
        step: "refresh-economy (no steps in response)",
        ok: false,
        durationMs: 0,
        detail: safeStringify(refreshRes.data),
      });
    }

    // Track real-step pass/fail BEFORE appending synthetic warnings step
    const refreshOk = refreshRes.ok && refreshSteps.every((s) => s.ok);

    const adaptedSteps: AdaptedStep[] = [...refreshSteps];

    // ── 3. Synthetic warnings step (does NOT influence top-level ok) ──
    const warnings = refreshRes.data?.warnings;
    if (Array.isArray(warnings) && warnings.length > 0) {
      adaptedSteps.push({
        step: "refresh-economy warnings",
        ok: true,
        durationMs: 0,
        detail: warnings.map(safeStringify).join("\n"),
      });
    }

    // ── 4. Optional process-turn (recalcOnly) — real step ──
    let processTurnOk: boolean | null = null;
    if (playerName) {
      const t0 = Date.now();
      const ptRes = await invokeFn(
        supabaseUrl, anonKey, serviceKey,
        "process-turn",
        { sessionId, playerName, recalcOnly: true },
      );
      const dur = Date.now() - t0;
      processTurnOk = ptRes.ok;
      adaptedSteps.push({
        step: "process-turn (recalcOnly)",
        ok: ptRes.ok,
        durationMs: dur,
        detail: ptRes.ok ? safeStringify(ptRes.data).slice(0, 300) : safeStringify(ptRes.data?.error ?? ptRes.data),
      });
    }

    // ── 5. Top-level ok: ONLY real steps. Warnings step is ignored. ──
    const ok = refreshOk && (processTurnOk ?? true);

    // totalMs: prefer upstream value, fallback to sum of step durations
    const upstreamTotal = refreshRes.data?.totalMs;
    const totalMs = Number.isFinite(upstreamTotal)
      ? Number(upstreamTotal) + adaptedSteps
          .filter((s) => s.step === "process-turn (recalcOnly)")
          .reduce((a, s) => a + s.durationMs, 0)
      : adaptedSteps.reduce((a, s) => a + s.durationMs, 0);

    return new Response(
      JSON.stringify({ ok, totalMs, steps: adaptedSteps }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: ok ? 200 : 207,
      },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
