// ─────────────────────────────────────────────────────────────────────────────
// world-layer-tick — World Ontology v9.1 Phase 4 + Phase 9
//
// Real implementation (not no-op). Called by commit-turn after strategic graph
// recompute. Owns:
//
//   Phase 4: route maintenance lifecycle
//     - decay maintenance_level by 5/turn
//     - if realm has gold ≥ upkeep_cost: pay, restore +10
//     - lifecycle transitions: maintained ↔ usable ↔ degraded ↔ blocked
//     - sync province_routes.control_state cache (K1)
//     - emit world_events for state changes
//
//   Phase 9: retention cleanup
//     - delete route_decay/route_maintained/route_blocked older than 50 turns
//
// K1 contract: route_state is authoritative. province_routes.control_state is
// a render cache, only written here.
// K3 retention: bounded events.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RouteStateRow {
  route_id: string;
  session_id: string;
  lifecycle_state: string;
  maintenance_level: number;
  quality_level: number;
  last_maintained_turn: number;
  upkeep_cost: number;
}

interface RouteRow {
  id: string;
  controlled_by: string | null;
  node_a: string;
  node_b: string;
}

function deriveLifecycle(maintenance: number, prev: string): string {
  // 'planned' / 'under_construction' are externally driven, leave them alone.
  if (prev === "planned" || prev === "under_construction") return prev;
  if (maintenance >= 80) return "maintained";
  if (maintenance >= 30) return "usable";
  if (maintenance >= 10) return "degraded";
  return "blocked";
}

function lifecycleToCacheControl(lifecycle: string): string {
  // Map authoritative lifecycle to legacy control_state cache field.
  switch (lifecycle) {
    case "blocked":
      return "blocked";
    case "degraded":
      return "contested";
    case "under_construction":
    case "planned":
      return "constructing";
    default:
      return "open";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body.sessionId || body.session_id;
    const turnNumber = Number(body.turnNumber ?? body.turn_number ?? 0);

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Load current route state + route owner info ──────────────────────
    const { data: states, error: stErr } = await sb
      .from("route_state")
      .select("route_id, session_id, lifecycle_state, maintenance_level, quality_level, last_maintained_turn, upkeep_cost")
      .eq("session_id", sessionId);
    if (stErr) throw new Error(`route_state load: ${stErr.message}`);

    if (!states || states.length === 0) {
      return new Response(JSON.stringify({ ok: true, phase4: { processed: 0 }, phase9: { deleted: 0 } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const routeIds = (states as RouteStateRow[]).map((s) => s.route_id);
    const { data: routes } = await sb
      .from("province_routes")
      .select("id, controlled_by, node_a, node_b")
      .in("id", routeIds);
    const routeMap = new Map<string, RouteRow>();
    for (const r of (routes as RouteRow[]) || []) routeMap.set(r.id, r);

    // ── Phase 4: maintenance + lifecycle transitions ─────────────────────
    let maintained = 0;
    let degraded = 0;
    let blocked = 0;
    let goldSpent = 0;
    const events: Array<Record<string, unknown>> = [];
    const stateUpdates: Array<Record<string, unknown>> = [];
    const cacheUpdates: Array<{ id: string; control: string }> = [];

    // Group routes by owner for efficient gold debit
    const ownerToRoutes = new Map<string, RouteStateRow[]>();
    const orphan: RouteStateRow[] = [];
    for (const s of states as RouteStateRow[]) {
      const route = routeMap.get(s.route_id);
      const owner = route?.controlled_by;
      if (!owner) {
        orphan.push(s);
        continue;
      }
      if (!ownerToRoutes.has(owner)) ownerToRoutes.set(owner, []);
      ownerToRoutes.get(owner)!.push(s);
    }

    for (const [owner, ownerStates] of ownerToRoutes.entries()) {
      // Read realm_resources for owner
      const { data: rr } = await sb
        .from("realm_resources")
        .select("gold_reserve")
        .eq("session_id", sessionId)
        .eq("player_name", owner)
        .maybeSingle();

      let goldAvail = Number(rr?.gold_reserve ?? 0);

      for (const s of ownerStates) {
        // Decay
        let nextMaint = Math.max(0, s.maintenance_level - 5);
        let lastMaintTurn = s.last_maintained_turn;
        let nextUnpaid = (s as any).turns_unpaid ?? 0;

        // Pay upkeep if affordable
        if (goldAvail >= s.upkeep_cost && nextMaint < 100) {
          goldAvail -= s.upkeep_cost;
          goldSpent += s.upkeep_cost;
          nextMaint = Math.min(100, nextMaint + 15);
          lastMaintTurn = turnNumber;
          nextUnpaid = 0;
        } else if (s.upkeep_cost > 0) {
          nextUnpaid += 1;
        }

        const prevLifecycle = s.lifecycle_state;
        let nextLifecycle = deriveLifecycle(nextMaint, prevLifecycle);
        // Hard transition: 3+ turns unpaid + degraded → blocked
        if (nextUnpaid >= 3 && nextLifecycle === "degraded") nextLifecycle = "blocked";

        stateUpdates.push({
          route_id: s.route_id,
          session_id: sessionId,
          lifecycle_state: nextLifecycle,
          maintenance_level: nextMaint,
          quality_level: s.quality_level,
          last_maintained_turn: lastMaintTurn,
          upkeep_cost: s.upkeep_cost,
          turns_unpaid: nextUnpaid,
          updated_at: new Date().toISOString(),
        });

        cacheUpdates.push({
          id: s.route_id,
          control: lifecycleToCacheControl(nextLifecycle),
        });

        if (prevLifecycle !== nextLifecycle) {
          if (nextLifecycle === "blocked") {
            blocked++;
            events.push({
              session_id: sessionId,
              turn_number: turnNumber,
              event_type: "route_blocked",
              severity: "warning",
              title: "Trasa zablokována",
              description: `Trasa ${s.route_id.slice(0, 8)} zkolabovala kvůli zanedbané údržbě (${nextUnpaid} tahů bez platby).`,
              metadata: { route_id: s.route_id, owner, maintenance: nextMaint, turns_unpaid: nextUnpaid },
            });
          } else if (nextLifecycle === "degraded") {
            degraded++;
            events.push({
              session_id: sessionId,
              turn_number: turnNumber,
              event_type: "route_decay",
              severity: "info",
              title: "Trasa chátrá",
              description: `Trasa ${s.route_id.slice(0, 8)} potřebuje opravu.`,
              metadata: { route_id: s.route_id, owner, maintenance: nextMaint },
            });
          } else if (nextLifecycle === "maintained") {
            maintained++;
          }
        }
      }

      if (goldSpent > 0 && rr) {
        await sb
          .from("realm_resources")
          .update({ gold_reserve: goldAvail })
          .eq("session_id", sessionId)
          .eq("player_name", owner);
      }
    }

    // Orphan routes (no owner) just decay, no upkeep
    for (const s of orphan) {
      const nextMaint = Math.max(0, s.maintenance_level - 5);
      const nextLifecycle = deriveLifecycle(nextMaint, s.lifecycle_state);
      stateUpdates.push({
        route_id: s.route_id,
        session_id: sessionId,
        lifecycle_state: nextLifecycle,
        maintenance_level: nextMaint,
        quality_level: s.quality_level,
        last_maintained_turn: s.last_maintained_turn,
        upkeep_cost: s.upkeep_cost,
        updated_at: new Date().toISOString(),
      });
      cacheUpdates.push({
        id: s.route_id,
        control: lifecycleToCacheControl(nextLifecycle),
      });
    }

    // Bulk upsert state
    if (stateUpdates.length > 0) {
      const { error: upErr } = await sb
        .from("route_state")
        .upsert(stateUpdates, { onConflict: "route_id" });
      if (upErr) console.warn("route_state upsert:", upErr.message);
    }

    // Sync province_routes.control_state cache
    for (const c of cacheUpdates) {
      await sb.from("province_routes").update({ control_state: c.control }).eq("id", c.id);
    }

    // Insert events
    if (events.length > 0) {
      await sb.from("world_events").insert(events);
    }

    // ── Phase 7: migrace mezi nody přes obchodní trasy ───────────────────
    let migrationsCreated = 0;
    let migrationPopMoved = 0;
    try {
      // Pull cities a city_market_baskets pro fulfillment ratios
      const { data: citiesData } = await sb
        .from("cities")
        .select("id, name, owner_player, population, hex_q, hex_r")
        .eq("session_id", sessionId);
      const cities = (citiesData ?? []) as Array<{ id: string; name: string; owner_player: string; population: number; hex_q: number; hex_r: number }>;
      const cityById = new Map(cities.map((c) => [c.id, c]));

      // Načti node→city mapping
      const { data: nodesData } = await sb
        .from("province_nodes")
        .select("id, city_id, mythic_tag")
        .eq("session_id", sessionId);
      const nodeById = new Map((nodesData ?? []).map((n: any) => [n.id, n]));

      // Načti aktuální state map
      const liveStates = new Map<string, any>();
      for (const u of stateUpdates) liveStates.set(u.route_id as string, u);

      // Načti push/pull signály (city_market_baskets)
      const { data: baskets } = await sb
        .from("city_market_baskets")
        .select("city_id, basket_kind, fulfillment_ratio")
        .eq("session_id", sessionId)
        .in("basket_kind", ["staple_food", "fuel", "basic_clothing"]);
      const cityNeed = new Map<string, number>(); // city_id → push score (0-1, 1=hladomor)
      for (const b of baskets ?? []) {
        const ratio = Number((b as any).fulfillment_ratio ?? 1);
        const deficit = Math.max(0, 1 - ratio);
        cityNeed.set((b as any).city_id, Math.max(cityNeed.get((b as any).city_id) ?? 0, deficit));
      }

      // Pro každou usable+ trasu rozhodni o migraci
      for (const [routeId, st] of liveStates.entries()) {
        const lc = String(st.lifecycle_state);
        if (lc !== "usable" && lc !== "maintained") continue;
        const route = routeMap.get(routeId);
        if (!route) continue;
        const nodeA = nodeById.get(route.node_a);
        const nodeB = nodeById.get(route.node_b);
        if (!nodeA?.city_id || !nodeB?.city_id) continue;
        const cityA = cityById.get(nodeA.city_id);
        const cityB = cityById.get(nodeB.city_id);
        if (!cityA || !cityB) continue;

        const needA = cityNeed.get(cityA.id) ?? 0;
        const needB = cityNeed.get(cityB.id) ?? 0;
        if (Math.abs(needA - needB) < 0.15) continue; // nedostatečný gradient

        const fromCity = needA > needB ? cityA : cityB;
        const toCity = needA > needB ? cityB : cityA;
        const fromNode = needA > needB ? route.node_a : route.node_b;
        const toNode = needA > needB ? route.node_b : route.node_a;
        const pushScore = Math.max(needA, needB);

        // Throughput cap = maintenance_level × 0.1 lidí/turn × population scale
        const cap = Math.floor(Number(st.maintenance_level) * 0.1);
        // Migration cap 2 % populace zdroje
        const popCap = Math.floor(fromCity.population * 0.02);
        const moved = Math.min(cap, popCap, Math.floor(fromCity.population * pushScore * 0.05));
        if (moved < 1) continue;

        await sb.from("cities").update({ population: fromCity.population - moved }).eq("id", fromCity.id);
        await sb.from("cities").update({ population: toCity.population + moved }).eq("id", toCity.id);
        fromCity.population -= moved;
        toCity.population += moved;

        await sb.from("node_migrations").insert({
          session_id: sessionId,
          turn_number: turnNumber,
          from_node: fromNode,
          to_node: toNode,
          population_delta: moved,
          reason: needA > 0.3 || needB > 0.3 ? "famine" : "opportunity",
          route_id: routeId,
        });

        await sb.from("world_events").insert({
          session_id: sessionId,
          turn_number: turnNumber,
          event_type: "node_migration",
          severity: "info",
          title: "Lidé se stěhují",
          description: `${moved} obyvatel opustilo ${fromCity.name} a hledá lepší život v ${toCity.name}.`,
          metadata: { from_city: fromCity.id, to_city: toCity.id, count: moved, route_id: routeId },
        });

        migrationsCreated++;
        migrationPopMoved += moved;
      }
    } catch (e) {
      console.warn("phase7 migration error:", (e as Error).message);
    }

    // ── Phase 8: mýtické nody → pasivní prestige + heritage_effects ──────
    let mythicPrestige = 0;
    try {
      const { data: mythicNodes } = await sb
        .from("province_nodes")
        .select("id, controlled_by, mythic_tag")
        .eq("session_id", sessionId)
        .not("mythic_tag", "is", null);

      const ownerToPrestige = new Map<string, number>();
      for (const n of mythicNodes ?? []) {
        const owner = (n as any).controlled_by;
        if (!owner) continue;
        ownerToPrestige.set(owner, (ownerToPrestige.get(owner) ?? 0) + 2);
      }

      // Plus heritage_effects.prestige_per_turn
      const { data: heritageEffects } = await sb
        .from("heritage_effects")
        .select("player_name, effect_type, effect_value")
        .eq("session_id", sessionId)
        .eq("effect_type", "prestige_per_turn");
      for (const e of heritageEffects ?? []) {
        const p = (e as any).player_name;
        ownerToPrestige.set(p, (ownerToPrestige.get(p) ?? 0) + Number((e as any).effect_value));
      }

      for (const [owner, amount] of ownerToPrestige.entries()) {
        const { data: rrCur } = await sb
          .from("realm_resources")
          .select("prestige_score")
          .eq("session_id", sessionId).eq("player_name", owner).maybeSingle();
        const cur = Number(rrCur?.prestige_score ?? 0);
        await sb.from("realm_resources")
          .update({ prestige_score: cur + amount })
          .eq("session_id", sessionId).eq("player_name", owner);
        mythicPrestige += amount;
      }
    } catch (e) {
      console.warn("phase8 mythic error:", (e as Error).message);
    }

    // ── Phase 9: retention cleanup ───────────────────────────────────────
    let phase9Deleted = 0;
    if (turnNumber > 50) {
      const { error: cleanErr, count } = await sb
        .from("world_events")
        .delete({ count: "exact" })
        .eq("session_id", sessionId)
        .in("event_type", ["route_decay", "route_maintained", "route_blocked", "node_migration"])
        .lt("turn_number", turnNumber - 50);
      if (cleanErr) console.warn("phase9 cleanup:", cleanErr.message);
      phase9Deleted = count ?? 0;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        phase4: { processed: stateUpdates.length, maintained, degraded, blocked, goldSpent },
        phase7: { migrations: migrationsCreated, populationMoved: migrationPopMoved },
        phase8: { mythicPrestige },
        phase9: { deleted: phase9Deleted },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("world-layer-tick error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
