// ─────────────────────────────────────────────────────────────────────────────
// manage-route — Player commands na route lifecycle (v9.1 Wave 2 / PR-D)
//
// Commands:
//   INVEST_MAINTENANCE  — okamžitě zaplatí 50g, +30 maintenance_level
//   RESTORE_ROUTE       — zaplatí 200g, vrátí blocked → usable, maintenance → 60
//   ABANDON_ROUTE       — vzdá se trasy, lifecycle → blocked, žádný gold
//
// K1: route_state je pravdou. Cache v province_routes.control_state se updatuje.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Command = "INVEST_MAINTENANCE" | "RESTORE_ROUTE" | "ABANDON_ROUTE";

const COSTS: Record<Command, number> = {
  INVEST_MAINTENANCE: 50,
  RESTORE_ROUTE: 200,
  ABANDON_ROUTE: 0,
};

function lifecycleToCache(lc: string): string {
  switch (lc) {
    case "blocked": return "blocked";
    case "degraded": return "contested";
    default: return "open";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { sessionId, routeId, command, playerName, turnNumber } = await req.json();
    if (!sessionId || !routeId || !command || !playerName) {
      return new Response(JSON.stringify({ error: "sessionId, routeId, command, playerName required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cmd = command as Command;
    if (!(cmd in COSTS)) {
      return new Response(JSON.stringify({ error: `unknown command ${command}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const cost = COSTS[cmd];

    // Check funds
    if (cost > 0) {
      const { data: rr } = await sb.from("realm_resources")
        .select("gold_reserve").eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
      const gold = Number(rr?.gold_reserve ?? 0);
      if (gold < cost) {
        return new Response(JSON.stringify({ error: "Nedostatek zlata", required: cost, have: gold }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await sb.from("realm_resources").update({ gold_reserve: gold - cost })
        .eq("session_id", sessionId).eq("player_name", playerName);
    }

    // Load route_state
    const { data: rs, error: rsErr } = await sb.from("route_state")
      .select("*").eq("route_id", routeId).maybeSingle();
    if (rsErr || !rs) {
      return new Response(JSON.stringify({ error: "route_state nenalezen" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let nextMaint = rs.maintenance_level;
    let nextLifecycle = rs.lifecycle_state;
    let nextUnpaid = rs.turns_unpaid ?? 0;
    let invested = (rs.player_invested_gold ?? 0) + cost;
    let title = "";
    let description = "";

    if (cmd === "INVEST_MAINTENANCE") {
      nextMaint = Math.min(100, nextMaint + 30);
      nextUnpaid = 0;
      nextLifecycle = nextMaint >= 80 ? "maintained" : nextMaint >= 30 ? "usable" : "degraded";
      title = "Údržba zaplacena";
      description = `Hráč ${playerName} investoval ${cost}g do údržby trasy. Maintenance: ${nextMaint}.`;
    } else if (cmd === "RESTORE_ROUTE") {
      nextMaint = 60;
      nextUnpaid = 0;
      nextLifecycle = "usable";
      title = "Trasa obnovena";
      description = `Hráč ${playerName} obnovil zablokovanou trasu za ${cost}g.`;
    } else if (cmd === "ABANDON_ROUTE") {
      nextMaint = 0;
      nextLifecycle = "blocked";
      title = "Trasa opuštěna";
      description = `Hráč ${playerName} se vzdal trasy.`;
    }

    await sb.from("route_state").update({
      maintenance_level: nextMaint,
      lifecycle_state: nextLifecycle,
      turns_unpaid: nextUnpaid,
      player_invested_gold: invested,
      last_maintained_turn: turnNumber ?? rs.last_maintained_turn,
      updated_at: new Date().toISOString(),
    }).eq("route_id", routeId);

    await sb.from("province_routes").update({ control_state: lifecycleToCache(nextLifecycle) }).eq("id", routeId);

    await sb.from("world_events").insert({
      session_id: sessionId,
      turn_number: turnNumber ?? 0,
      event_type: cmd === "ABANDON_ROUTE" ? "route_blocked" : "route_maintained",
      severity: "info",
      title,
      description,
      metadata: { route_id: routeId, player: playerName, cost, command: cmd },
    });

    return new Response(JSON.stringify({
      ok: true,
      route_id: routeId,
      lifecycle_state: nextLifecycle,
      maintenance_level: nextMaint,
      gold_spent: cost,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("manage-route error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
