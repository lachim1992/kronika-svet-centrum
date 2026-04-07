import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * recompute-all: Full pipeline recalculation without advancing the turn.
 * 
 * Sequence:
 * 1. compute-province-routes (rebuild routes)
 * 2. compute-hex-flows (force_all: true)
 * 3. compute-economy-flow (node-level metrics)
 * 4. compute-trade-flows (goods pipeline)
 * 5. process-turn (recalcOnly: true — economy aggregates only)
 */

interface StepResult {
  step: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

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
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": anonKey,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
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
    const { sessionId, playerName } = await req.json();
    if (!sessionId) throw new Error("Missing sessionId");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const results: StepResult[] = [];

    const steps: { name: string; fn: string; body: Record<string, unknown> }[] = [
      { name: "compute-province-routes", fn: "compute-province-routes", body: { sessionId } },
      { name: "compute-hex-flows", fn: "compute-hex-flows", body: { sessionId, force_all: true } },
      { name: "compute-economy-flow", fn: "compute-economy-flow", body: { sessionId } },
      { name: "compute-trade-flows", fn: "compute-trade-flows", body: { sessionId } },
    ];

    // If playerName provided, also run process-turn in recalcOnly mode
    if (playerName) {
      steps.push({
        name: "process-turn (recalcOnly)",
        fn: "process-turn",
        body: { sessionId, playerName, recalcOnly: true },
      });
    }

    for (const step of steps) {
      const t0 = Date.now();
      const res = await invokeStep(supabaseUrl, anonKey, serviceKey, step.fn, step.body);
      const durationMs = Date.now() - t0;
      results.push({
        step: step.name,
        ok: res.ok,
        durationMs,
        detail: res.ok ? JSON.stringify(res.data).slice(0, 300) : res.error,
      });

      // If a step fails, continue but log the error
      if (!res.ok) {
        console.error(`Step ${step.name} failed:`, res.error);
      }
    }

    const allOk = results.every(r => r.ok);
    const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

    return new Response(JSON.stringify({
      ok: allOk,
      totalMs,
      steps: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: allOk ? 200 : 207,
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
