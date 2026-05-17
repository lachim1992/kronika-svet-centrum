// compute-basket-trade-flows: L2 basket-level solver.
// Pairs export_surplus × unmet_demand inside the same trade_system,
// gated by player_trade_system_access. Writes basket_trade_flows and
// folds imports back into city_market_baskets + goods_wealth_fiscal.
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

    // 1. Load baskets
    const { data: baskets, error: bErr } = await sb
      .from("city_market_baskets")
      .select("city_id, player_name, basket_key, export_surplus, unmet_demand, local_demand, local_supply, auto_supply, bonus_supply, turn_number")
      .eq("session_id", session_id);
    if (bErr) { console.error("baskets load", bErr); throw bErr; }

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

    if (!baskets || baskets.length === 0) {
      return new Response(JSON.stringify({ ok: true, flows: 0, reason: "no baskets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5. Bucket: (system_id, basket_key) → surplus[] / demand[]
    type Side = { city_id: string; player: string; amount: number };
    const surplusBuckets = new Map<string, Side[]>();
    const demandBuckets = new Map<string, Side[]>();
    const turnByCity = new Map<string, number>();

    for (const b of baskets) {
      const systemId = citySystem.get(b.city_id);
      if (!systemId) continue;
      turnByCity.set(b.city_id, Number(b.turn_number || 0));
      const key = `${systemId}::${b.basket_key}`;
      const surplus = Number(b.export_surplus || 0);
      const demand = Number(b.unmet_demand || 0);
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
            turn_number: turnByCity.get(d.city_id) || 0,
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
      if (imp === 0 && exp === 0) continue;

      const localSupply = Number(b.local_supply || 0);
      const auto = Number(b.auto_supply || 0);
      const bonus = Number(b.bonus_supply || 0);
      const demand = Number(b.local_demand || 0);
      const totalSupply = localSupply + auto + bonus + imp;
      const sat = demand > 0 ? Math.min(1, totalSupply / demand) : 1;

      const { error: uErr } = await sb.from("city_market_baskets")
        .update({
          local_supply: Math.round((localSupply + imp) * 1000) / 1000,
          export_surplus: Math.max(0, Number(b.export_surplus || 0) - exp),
          unmet_demand: Math.max(0, demand - totalSupply),
          domestic_satisfaction: Math.round(sat * 1000) / 1000,
        })
        .eq("session_id", session_id)
        .eq("city_id", b.city_id)
        .eq("basket_key", b.basket_key);
      if (uErr) { console.error("update basket", uErr); /* non-fatal per row */ }
      else basketUpdates++;
    }

    // 9. Fold fiscal_capture into goods_wealth_fiscal
    for (const [player, amount] of fiscalByPlayer) {
      const { data: rr } = await sb.from("realm_resources")
        .select("goods_wealth_fiscal")
        .eq("session_id", session_id)
        .eq("player_name", player)
        .maybeSingle();
      const prev = Number(rr?.goods_wealth_fiscal || 0);
      const { error: rErr } = await sb.from("realm_resources")
        .update({ goods_wealth_fiscal: Math.round((prev + amount) * 100) / 100 })
        .eq("session_id", session_id)
        .eq("player_name", player);
      if (rErr) console.error("update goods_wealth_fiscal", player, rErr);
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
