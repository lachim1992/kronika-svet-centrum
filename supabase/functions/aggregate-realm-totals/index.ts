// aggregate-realm-totals: FINAL AGGREGATION phase (Economy Integrity Pass, Krok 2).
//
// WRITER CONTRACT:
// - READS: province_nodes (persisted physical state), basket_trade_flows,
//   realm_resources fiscal pillars.
// - WRITES: realm_resources derived totals ONLY — total_production, total_gdp,
//   total_wealth (alias of fiscal_revenue, see docs/architecture/economy-contract.md),
//   total_supplies, total_capacity, total_importance, strategic_*_tier.
// - NEVER computes or mutates taxes, expenses, gold_reserve or legitimacy.
//   `process-turn` is the sole owner of turn fiscal state (INVARIANT 1).
// - NEVER writes history or snapshots (INVARIANT 2).
//
// It is idempotent: same input state → identical output (pure read + sum).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function computeTier(count: number): number {
  if (count >= 6) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

interface Totals {
  production: number; wealth: number; supplies: number; capacity: number;
  importance: number; logistic: number;
  iron: number; horses: number; salt: number; copper: number; gold_res: number;
  marble: number; gems: number; timber: number; obsidian: number; silk: number; incense: number;
}

const emptyTotals = (): Totals => ({
  production: 0, wealth: 0, supplies: 0, capacity: 0, importance: 0, logistic: 0,
  iron: 0, horses: 0, salt: 0, copper: 0, gold_res: 0,
  marble: 0, gems: 0, timber: 0, obsidian: 0, silk: 0, incense: 0,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const session_id = body.session_id ?? body.sessionId;
    // phase = "physical" → physical/derived totals only (runs BEFORE process-turn,
    //   so the fiscal writer never resolves a turn against stale aggregates).
    // phase = "final"    → same totals + fiscal aliases (runs AFTER process-turn).
    const phase: "physical" | "final" = body.phase === "physical" ? "physical" : "final";
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // NOTE: wealth_output is legacy abstract wealth-flow and is deliberately NOT read
    // here (allowlist: compute-economy-flow + dev/debug only).
    const { data: nodes, error: nodesErr } = await sb.from("province_nodes")
      .select("controlled_by, production_output, food_value, capacity_score, importance_score, strategic_resource_type, metadata")
      .eq("session_id", session_id);
    if (nodesErr) throw nodesErr;

    const byPlayer = new Map<string, Totals>();
    for (const node of nodes || []) {
      const player = (node as any).controlled_by as string | null;
      if (!player) continue;
      if (!byPlayer.has(player)) byPlayer.set(player, emptyTotals());
      const t = byPlayer.get(player)!;
      // LAYER A: organized production capacity (potential), NOT production.
      t.production += Number((node as any).production_output || 0);

      t.supplies += Number((node as any).food_value || 0);
      t.capacity += Number((node as any).capacity_score || 0);
      t.importance += Number((node as any).importance_score || 0);
      // province_nodes has no logistic_capacity column; capacity_score is the SSOT.

      const res = (node as any).strategic_resource_type || (node as any).metadata?.strategic_resource;
      if (res === "iron" || res === "mineral") t.iron++;
      if (res === "horses") t.horses++;
      if (res === "salt") t.salt++;
      if (res === "copper") t.copper++;
      if (res === "gold_deposit") t.gold_res++;
      if (res === "marble") t.marble++;
      if (res === "gems") t.gems++;
      if (res === "timber") t.timber++;
      if (res === "obsidian") t.obsidian++;
      if (res === "silk") t.silk++;
      if (res === "incense") t.incense++;
    }

    // Fiscal pillars are READ ONLY here — written by process-turn.
    // goods_production_value is READ ONLY here — written by compute-trade-flows (Layer B).
    // Read EVERY realm of the session (not just node owners): a player who lost or never
    // owned nodes must be written as an explicit 0, never left with a stale capacity.
    const { data: realmRows } = await sb.from("realm_resources")
      .select("player_name, wealth_pop_tax, wealth_domestic_market, goods_wealth_fiscal, goods_production_value")
      .eq("session_id", session_id);
    for (const r of realmRows || []) {
      const p = (r as any).player_name as string;
      if (p && !byPlayer.has(p)) byPlayer.set(p, emptyTotals());
    }
    if (byPlayer.size === 0) {
      return new Response(JSON.stringify({ ok: true, players: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pillarsByPlayer = new Map<string, any>(
      (realmRows || []).map((r: any) => [r.player_name, r]),
    );


    // Export magnitude — a separate TRADE metric. It must NOT be added to GDP:
    // exported goods are already inside realized production value (double counting).
    const { data: btfRows } = await sb.from("basket_trade_flows")
      .select("source_player, gross_value")
      .eq("session_id", session_id);
    const exportValue = new Map<string, number>();
    for (const row of btfRows || []) {
      const p = (row as any).source_player as string;
      if (!p) continue;
      exportValue.set(p, (exportValue.get(p) || 0) + Number((row as any).gross_value || 0));
    }

    const summary: Record<string, any> = {};
    for (const [player, t] of byPlayer) {
      const pillars = pillarsByPlayer.get(player) || {};
      // fiscal_revenue = income components only (no expenses).
      const fiscalRevenue =
        Number(pillars.wealth_pop_tax || 0) +
        Number(pillars.wealth_domestic_market || 0) +
        Number(pillars.goods_wealth_fiscal || 0);

      const exportGross = exportValue.get(player) || 0;
      // GDP proxy (provisional — see economy-contract.md):
      // total_gdp == goods_production_value (Layer B realized output). Node capacity
      // (Layer A) and export value are NOT part of it.
      // TODO(value-added pass): eliminate intermediate goods double counting.
      const totalGdp = Number(pillars.goods_production_value || 0);
      const capacity = t.capacity;

      const update: Record<string, any> = {
        // Layer A capacity. total_production is kept as a DEPRECATED alias.
        total_production_capacity: Math.round(t.production * 100) / 100,
        total_production: Math.round(t.production * 100) / 100,
        total_gdp: Math.round(totalGdp * 100) / 100,
        // Canonical export magnitude — never derive export as total_gdp − goods_production_value.
        export_gross_value: Math.round(exportGross * 100) / 100,
        total_supplies: Math.round(t.supplies * 100) / 100,
        total_capacity: Math.round(capacity * 100) / 100,
        total_importance: Math.round(t.importance * 100) / 100,

        strategic_iron_tier: computeTier(t.iron),
        strategic_horses_tier: computeTier(t.horses),
        strategic_salt_tier: computeTier(t.salt),
        strategic_copper_tier: computeTier(t.copper),
        strategic_gold_tier: computeTier(t.gold_res),
        strategic_marble_tier: computeTier(t.marble),
        strategic_gems_tier: computeTier(t.gems),
        strategic_timber_tier: computeTier(t.timber),
        strategic_obsidian_tier: computeTier(t.obsidian),
        strategic_silk_tier: computeTier(t.silk),
        strategic_incense_tier: computeTier(t.incense),
      };
      if (phase === "final") {
        // total_wealth is a legacy alias of fiscal_revenue; never a fiscal source.
        update.total_wealth = Math.round(fiscalRevenue * 100) / 100;
      }
      const { error: uErr } = await sb.from("realm_resources").update(update)
        .eq("session_id", session_id).eq("player_name", player);
      if (uErr) console.error("aggregate-realm-totals update", player, uErr);
      summary[player] = {
        total_gdp: update.total_gdp,
        fiscal_revenue: update.total_wealth ?? null,
        total_production: update.total_production,
        total_capacity: update.total_capacity,
      };
    }

    return new Response(JSON.stringify({ ok: true, phase, players: byPlayer.size, totals: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aggregate-realm-totals error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
