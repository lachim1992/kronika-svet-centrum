// compute-basket-trade-flows: L2 basket-level solver.
// Pairs export_surplus × unmet_demand inside the same trade_system,
// gated by player_trade_system_access. Writes basket_trade_flows and
// folds net imports/exports back into city_market_baskets.
// Fiscal capture on flows is a projection, not a treasury posting.
//
// Phase 2 invariants:
// - source_city_id / target_city_id MUST be cities.id
// - Unconditional cleanup: empty basket_trade_flows for session before insert
// - Greedy largest-demand-first within (trade_system, basket_key)
// - access_level 0 = no flow; tariff_factor 1.0 = no tariff applied
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Canonical basket base prices (unit value of 1 basket point).
// Kept here intentionally: solver SSOT, not pulled from DB.
const BASKET_BASE_PRICE: Record<string, number> = {
  staple_food: 1.0,
  luxury_food: 2.5,
  tools: 2.0,
  metalwork: 3.0,
  textiles: 2.0,
  luxury_textiles: 4.0,
  building_materials: 1.5,
  fuel: 1.0,
  ritual_goods: 3.5,
  arms: 4.0,
  livestock: 1.8,
  strategic_resources: 5.0,
};
const DEFAULT_PRICE = 1.5;
const MONETIZATION_EFFICIENCY = 0.6;

function priceFor(basket: string): number {
  return BASKET_BASE_PRICE[basket] ?? DEFAULT_PRICE;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session, error: sessionError } = await sb.from("game_sessions")
      .select("current_turn").eq("id", session_id).single();
    if (sessionError) throw sessionError;
    if (!session || !Number.isInteger(session.current_turn)) throw new Error("Session turn is missing");
    const turnNumber = session.current_turn;

    // 1. Only the current snapshot participates. Historical basket rows are
    // chart data, not additional supply/demand available for today's trade.
    const { data: basketRows, error: bErr } = await sb
      .from("city_market_baskets")
      .select("city_id, player_name, basket_key, export_surplus, unmet_demand, local_demand, local_supply, auto_supply, bonus_supply, turn_number")
      .eq("session_id", session_id).eq("turn_number", turnNumber);
    if (bErr) { console.error("baskets load", bErr); throw bErr; }
    const baskets = basketRows || [];

    // 2. Load nodes → city_id → trade_system_id
    const { data: nodes, error: nErr } = await sb
      .from("province_nodes")
      .select("city_id, trade_system_id")
      .eq("session_id", session_id)
      .not("city_id", "is", null)
      .not("trade_system_id", "is", null);
    if (nErr) { console.error("nodes load", nErr); throw nErr; }

    const citySystem = new Map<string, string>();
    for (const n of nodes || []) {
      if (n.city_id && n.trade_system_id) citySystem.set(n.city_id, n.trade_system_id);
    }

    // 3. Load access projections
    const { data: access, error: aErr } = await sb
      .from("player_trade_system_access")
      .select("player_name, trade_system_id, access_level, tariff_factor")
      .eq("session_id", session_id);
    if (aErr) { console.error("access load", aErr); throw aErr; }

    const accessMap = new Map<string, { level: number; tariff: number }>();
    for (const a of access || []) {
      accessMap.set(`${a.player_name}::${a.trade_system_id}`,
        { level: Number(a.access_level || 0), tariff: Number(a.tariff_factor || 1.0) });
    }

    // 4. Unconditional cleanup
    const { error: dErr } = await sb.from("basket_trade_flows")
      .delete().eq("session_id", session_id);
    if (dErr) { console.error("cleanup basket_trade_flows", dErr); throw dErr; }

    // 5. Bucket: (system_id, basket_key) → surplus[] / demand[]
    type Side = { city_id: string; player: string; amount: number };
    const surplusBuckets = new Map<string, Side[]>();
    const demandBuckets = new Map<string, Side[]>();

    for (const b of baskets) {
      const systemId = citySystem.get(b.city_id);
      if (!systemId) continue;
      const key = `${systemId}::${b.basket_key}`;
      // Rebuild from the domestic baseline, never the previously traded result.
      // L1 defines local_supply = auto_supply + bonus_supply. Using its enriched
      // value here would consume yesterday's import a second time on refresh.
      const domesticSupply = Number(b.auto_supply || 0) + Number(b.bonus_supply || 0);
      const localDemand = Number(b.local_demand || 0);
      const surplus = Math.max(0, domesticSupply - localDemand);
      const demand = Math.max(0, localDemand - domesticSupply);
      if (surplus > 0) {
        if (!surplusBuckets.has(key)) surplusBuckets.set(key, []);
        surplusBuckets.get(key)!.push({ city_id: b.city_id, player: b.player_name, amount: surplus });
      }
      if (demand > 0) {
        if (!demandBuckets.has(key)) demandBuckets.set(key, []);
        demandBuckets.get(key)!.push({ city_id: b.city_id, player: b.player_name, amount: demand });
      }
    }

    // 6. Greedy solver
    type Flow = {
      session_id: string;
      trade_system_id: string;
      basket_key: string;
      source_city_id: string;
      target_city_id: string;
      source_player: string;
      target_player: string;
      volume: number;
      unit_price: number;
      gross_value: number;
      tariff_factor: number;
      fiscal_capture: number;
      access_level: number;
      turn_number: number;
    };
    const flows: Flow[] = [];
    const importsByCityBasket = new Map<string, number>();
    const exportsByCityBasket = new Map<string, number>();
    const fiscalByPlayer = new Map<string, number>();

    for (const [key, demands] of demandBuckets) {
      const supplies = surplusBuckets.get(key);
      if (!supplies) continue;
      const [systemId, basket] = key.split("::");
      const price = priceFor(basket);

      // largest demand first
      demands.sort((a, b) => b.amount - a.amount);
      supplies.sort((a, b) => b.amount - a.amount);

      for (const d of demands) {
        if (d.amount <= 0) continue;
        const dAccess = accessMap.get(`${d.player}::${systemId}`);
        if (!dAccess || dAccess.level < 1) continue;

        for (const s of supplies) {
          if (s.amount <= 0) continue;
          if (s.city_id === d.city_id) continue;
          const sAccess = accessMap.get(`${s.player}::${systemId}`);
          if (!sAccess || sAccess.level < 1) continue;

          const vol = Math.min(s.amount, d.amount);
          if (vol <= 0) continue;

          const tariff = Math.max(sAccess.tariff, dAccess.tariff);
          const gross = vol * price;
          const fiscal = gross * tariff * MONETIZATION_EFFICIENCY;

          flows.push({
            session_id,
            trade_system_id: systemId,
            basket_key: basket,
            source_city_id: s.city_id,
            target_city_id: d.city_id,
            source_player: s.player,
            target_player: d.player,
            volume: Math.round(vol * 1000) / 1000,
            unit_price: price,
            gross_value: Math.round(gross * 100) / 100,
            tariff_factor: tariff,
            fiscal_capture: Math.round(fiscal * 100) / 100,
            access_level: Math.max(1, Math.min(Number(sAccess.level) || 1, Number(dAccess.level) || 1)),
            turn_number: turnNumber,
          });

          s.amount -= vol;
          d.amount -= vol;
          importsByCityBasket.set(`${d.city_id}::${basket}`,
            (importsByCityBasket.get(`${d.city_id}::${basket}`) || 0) + vol);
          exportsByCityBasket.set(`${s.city_id}::${basket}`,
            (exportsByCityBasket.get(`${s.city_id}::${basket}`) || 0) + vol);
          fiscalByPlayer.set(s.player, (fiscalByPlayer.get(s.player) || 0) + fiscal);

          if (d.amount <= 0) break;
        }
      }
    }

    // 7. Insert flows in batches
    if (flows.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < flows.length; i += BATCH) {
        const slice = flows.slice(i, i + BATCH);
        const { error: iErr } = await sb.from("basket_trade_flows").insert(slice);
        if (iErr) { console.error("insert basket_trade_flows", iErr); throw iErr; }
      }
    }

    // 8. Fold imports/exports back into city_market_baskets
    let basketUpdates = 0;
    for (const b of baskets) {
      const imp = importsByCityBasket.get(`${b.city_id}::${b.basket_key}`) || 0;
      const exp = exportsByCityBasket.get(`${b.city_id}::${b.basket_key}`) || 0;
      const auto = Number(b.auto_supply || 0);
      const bonus = Number(b.bonus_supply || 0);
      const demand = Number(b.local_demand || 0);
      const domesticSupply = auto + bonus;
      const totalSupply = Math.max(0, domesticSupply + imp - exp);
      const sat = demand > 0 ? Math.min(1, totalSupply / demand) : 1;

      const { error: uErr } = await sb.from("city_market_baskets")
        .update({
          local_supply: Math.round(totalSupply * 1000) / 1000,
          export_surplus: Math.max(0, domesticSupply - demand - exp),
          unmet_demand: Math.max(0, demand - totalSupply),
          domestic_satisfaction: Math.round(sat * 1000) / 1000,
        })
        .eq("session_id", session_id)
        .eq("city_id", b.city_id)
        .eq("basket_key", b.basket_key)
        .eq("turn_number", turnNumber);
      if (uErr) { console.error("update basket", uErr); throw uErr; }
      else basketUpdates++;
    }

    // Do not add fiscal_capture to goods_wealth_fiscal on refresh. process-turn
    // owns that ledger via the v6 tax model. Repeated refreshes used to inflate
    // income until the next turn overwrote it. The flow projection remains
    // available for a future, explicitly designed tariff integration.

    // GDP uses the same domestic-production + export-value definition as the
    // former macro aggregator, but now reads this run's flows rather than the
    // previous run. Also clear old export value when a route disappears.
    const { data: realms, error: realmsError } = await sb.from("realm_resources")
      .select("player_name, total_production").eq("session_id", session_id);
    if (realmsError) throw realmsError;
    const exportsByPlayer = new Map<string, number>();
    for (const flow of flows) {
      exportsByPlayer.set(flow.source_player,
        (exportsByPlayer.get(flow.source_player) || 0) + flow.gross_value);
    }
    for (const realm of realms || []) {
      const gdp = Number(realm.total_production || 0) + (exportsByPlayer.get(realm.player_name) || 0);
      const { error } = await sb.from("realm_resources")
        .update({ total_gdp: Math.round(gdp * 100) / 100 })
        .eq("session_id", session_id).eq("player_name", realm.player_name);
      if (error) throw error;
    }

    return new Response(JSON.stringify({
      ok: true,
      flows: flows.length,
      basket_updates: basketUpdates,
      fiscal_recipients: fiscalByPlayer.size,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("compute-basket-trade-flows error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
