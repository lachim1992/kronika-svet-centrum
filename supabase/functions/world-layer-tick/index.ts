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

import { planRouteMaintenance, type RouteStateRow } from "../_shared/routeUpkeep.ts";

interface RouteRow {
  id: string;
  controlled_by: string | null;
  node_a: string;
  node_b: string;
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

    // ── Per-turn idempotency guard ───────────────────────────────────────
    // A retried turn must neither decay routes twice nor charge upkeep twice.
    const { data: guard } = await sb
      .from("world_layer_tick_guards")
      .select("result")
      .eq("session_id", sessionId)
      .eq("turn_number", turnNumber)
      .maybeSingle();
    if (guard) {
      return new Response(JSON.stringify({ ok: true, replayed: true, ...(guard.result || {}) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Phase 4: maintenance + lifecycle transitions ─────────────────────
    // FISCAL BOUNDARY: this phase never writes gold. It stamps the routes it
    // serviced; process-turn charges that upkeep inside the turn ledger.
    const goldByOwner = new Map<string, number>();
    const { data: realms } = await sb
      .from("realm_resources")
      .select("player_name, gold_reserve")
      .eq("session_id", sessionId);
    for (const r of realms || []) goldByOwner.set((r as any).player_name, Number((r as any).gold_reserve ?? 0));

    const plan = planRouteMaintenance({
      sessionId,
      turnNumber,
      states: states as RouteStateRow[],
      ownerOf: (routeId) => routeMap.get(routeId)?.controlled_by ?? null,
      goldOf: (owner) => goldByOwner.get(owner) ?? 0,
    });
    const { stateUpdates, cacheUpdates, events, upkeepByOwner, maintained, degraded, blocked } = plan;
    const upkeepDue = Object.values(upkeepByOwner).reduce((a, b) => a + b, 0);

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

    // ── Phase 7: REMOVED (Phase A) ───────────────────────────────────────
    // The former "migrace mezi nody přes obchodní trasy" block read and wrote
    // city/basket schema columns that do not exist. Every call failed and was
    // swallowed by its own try/catch, so it never moved a single inhabitant.
    // Network-based intercity migration is Phase E and will be implemented on the
    // canonical columns with strict conservation, as described in
    // docs/architecture/world-layer-contract.md. Do not re-add a writer here.
    const migrationsCreated = 0;
    const migrationPopMoved = 0;


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

    const result = {
      // upkeepDue is charged by process-turn (single turn-fiscal writer), not here.
      phase4: { processed: stateUpdates.length, maintained, degraded, blocked, upkeepDue, upkeepByOwner },
      phase7: { migrations: migrationsCreated, populationMoved: migrationPopMoved },
      phase8: { mythicPrestige },
      phase9: { deleted: phase9Deleted },
    };
    await sb.from("world_layer_tick_guards")
      .upsert({ session_id: sessionId, turn_number: turnNumber, result }, { onConflict: "session_id,turn_number" });

    return new Response(
      JSON.stringify({ ok: true, ...result }),
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
