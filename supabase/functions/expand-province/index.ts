import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id, player_name, province_id, target_q, target_r, skip_cost } = await req.json();

    if (!session_id || !player_name || !province_id || target_q === undefined || target_r === undefined) {
      return new Response(
        JSON.stringify({ error: "session_id, player_name, province_id, target_q, target_r required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Verify the province belongs to the player
    const { data: province } = await sb
      .from("provinces")
      .select("id, owner_player, session_id")
      .eq("id", province_id)
      .eq("session_id", session_id)
      .single();

    if (!province) {
      return new Response(
        JSON.stringify({ error: "Provincie nenalezena" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (province.owner_player !== player_name) {
      return new Response(
        JSON.stringify({ error: "Tato provincie vám nepatří" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check that target hex is NOT already part of any province
    const { data: targetHex } = await sb
      .from("province_hexes")
      .select("id, province_id, q, r")
      .eq("session_id", session_id)
      .eq("q", target_q)
      .eq("r", target_r)
      .maybeSingle();

    if (targetHex?.province_id) {
      return new Response(
        JSON.stringify({ error: "Tento hex již patří do jiné provincie" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Check that target hex is adjacent to at least one hex of this province
    const { data: myProvinceHexes } = await sb
      .from("province_hexes")
      .select("q, r")
      .eq("session_id", session_id)
      .eq("province_id", province_id);

    if (!myProvinceHexes || myProvinceHexes.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provincie nemá žádné hexy" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let isAdjacent = false;
    for (const ph of myProvinceHexes) {
      for (const [dq, dr] of NEIGHBORS) {
        if (ph.q + dq === target_q && ph.r + dr === target_r) {
          isAdjacent = true;
          break;
        }
      }
      if (isAdjacent) break;
    }

    if (!isAdjacent && !skip_cost) {
      return new Response(
        JSON.stringify({ error: "Hex není sousední s vaší provincií" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Check expansion cost — deduct from realm_resources
    const EXPANSION_COST = { gold_reserve: 20, wood_reserve: 5 };
    const { data: resources } = await sb
      .from("realm_resources")
      .select("gold_reserve, wood_reserve")
      .eq("session_id", session_id)
      .eq("player_name", player_name)
      .single();

    if (!resources) {
      return new Response(
        JSON.stringify({ error: "Zdroje nenalezeny" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (resources.gold_reserve < EXPANSION_COST.gold_reserve || resources.wood_reserve < EXPANSION_COST.wood_reserve) {
      return new Response(
        JSON.stringify({ error: `Nedostatek zdrojů. Potřeba: ${EXPANSION_COST.gold_reserve} zlata, ${EXPANSION_COST.wood_reserve} dřeva` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Generate the hex if it doesn't exist yet
    let hexId = targetHex?.id;
    if (!hexId) {
      const funcUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-hex`;
      const hexRes = await fetch(funcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ session_id, q: target_q, r: target_r }),
      });
      if (!hexRes.ok) throw new Error("generate-hex failed");
      const hex = await hexRes.json();
      hexId = hex.id;
    }

    // 6. Assign hex to province
    await sb.from("province_hexes")
      .update({ province_id })
      .eq("id", hexId);

    // 7. Deduct resources
    await sb.from("realm_resources")
      .update({
        gold_reserve: resources.gold_reserve - EXPANSION_COST.gold_reserve,
        wood_reserve: resources.wood_reserve - EXPANSION_COST.wood_reserve,
      })
      .eq("session_id", session_id)
      .eq("player_name", player_name);

    // 8. Add discovery
    await sb.from("discoveries").upsert({
      session_id,
      player_name,
      entity_type: "province_hex",
      entity_id: hexId,
      source: "expansion",
    }, { onConflict: "session_id,player_name,entity_type,entity_id" });

    return new Response(JSON.stringify({
      ok: true,
      hex_id: hexId,
      province_id,
      q: target_q,
      r: target_r,
      cost: EXPANSION_COST,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
