// set-node-production-order: validated writer for node_production_orders.
// Only mutation path for player production preferences. Service role bypasses RLS.
//
// Validates:
//  - JWT (caller identity)
//  - node ownership: province_nodes.controlled_by == caller player_name
//  - target_basket_key ∈ VALID_BASKETS (12 canonical)
//  - mode ∈ {auto, prefer, lock}
//  - target_good_key (if provided) must be a good whose demand_basket resolves to target_basket_key
//
// Body: { session_id, node_id, target_basket_key, mode, target_good_key? }
// auto → effectively deletes the row (no preference).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_BASKETS = new Set([
  "staple_food","basic_clothing","tools","fuel","drinking_water",
  "storage_logistics","admin_supplies","construction","metalwork",
  "military_supply","luxury_clothing","feast",
]);
const VALID_MODES = new Set(["auto", "prefer", "lock"]);

const LEGACY_BASKET_MAP: Record<string, string> = {
  textiles: "basic_clothing",
  luxury_textiles: "luxury_clothing",
  building_materials: "construction",
  ritual_goods: "feast",
  arms: "military_supply",
  luxury_food: "feast",
  livestock: "staple_food",
  strategic_resources: "metalwork",
};
function resolveBasket(raw: string): string {
  if (VALID_BASKETS.has(raw)) return raw;
  return LEGACY_BASKET_MAP[raw] ?? "staple_food";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Auth: JWT validation via anon-key client
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing Authorization" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid token" }, 401);

    const body = await req.json().catch(() => ({}));
    const { session_id, node_id, target_basket_key, mode, target_good_key } = body || {};
    if (!session_id || !node_id || !target_basket_key || !mode) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!VALID_MODES.has(mode)) return json({ error: `Invalid mode: ${mode}` }, 400);
    const canonicalBasket = resolveBasket(target_basket_key);
    if (!VALID_BASKETS.has(canonicalBasket)) {
      return json({ error: `Invalid target_basket_key: ${target_basket_key}` }, 400);
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // ── Resolve caller's player_name in this session
    const { data: gp, error: gpErr } = await sb
      .from("game_players")
      .select("player_name")
      .eq("session_id", session_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (gpErr || !gp?.player_name) {
      return json({ error: "Not a member of this session" }, 403);
    }
    const playerName = gp.player_name;

    // ── Ownership: node.controlled_by must match
    const { data: node, error: nErr } = await sb
      .from("province_nodes")
      .select("id, session_id, controlled_by")
      .eq("id", node_id)
      .eq("session_id", session_id)
      .maybeSingle();
    if (nErr || !node) return json({ error: "Node not found" }, 404);
    if (node.controlled_by !== playerName) {
      return json({ error: "You do not control this node" }, 403);
    }

    // ── Optional target_good_key validation
    if (target_good_key) {
      const { data: g } = await sb
        .from("goods").select("key, demand_basket")
        .eq("key", target_good_key).maybeSingle();
      if (!g) return json({ error: `Unknown good_key: ${target_good_key}` }, 400);
      const gBasket = resolveBasket(g.demand_basket || "staple_food");
      if (gBasket !== canonicalBasket) {
        return json({ error: `Good ${target_good_key} (${gBasket}) doesn't match basket ${canonicalBasket}` }, 400);
      }
    }

    // ── auto = clear preference
    if (mode === "auto") {
      const { error: dErr } = await sb.from("node_production_orders")
        .delete().eq("session_id", session_id).eq("node_id", node_id);
      if (dErr) return json({ error: dErr.message }, 500);
      return json({ ok: true, cleared: true });
    }

    // ── upsert
    const { error: uErr } = await sb.from("node_production_orders").upsert({
      session_id, node_id, player_name: playerName,
      target_basket_key: canonicalBasket,
      target_good_key: target_good_key || null,
      mode,
      last_status: null, last_status_reason: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,node_id" });
    if (uErr) return json({ error: uErr.message }, 500);

    return json({ ok: true, mode, target_basket_key: canonicalBasket });
  } catch (e: any) {
    console.error("set-node-production-order error", e);
    return json({ error: e.message || String(e) }, 500);
  }
});
