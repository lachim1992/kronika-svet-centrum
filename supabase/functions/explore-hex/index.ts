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
    const { session_id, player_name, q, r } = await req.json();

    if (!session_id || !player_name || q === undefined || r === undefined) {
      return new Response(
        JSON.stringify({ error: "session_id, player_name, q, r required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get player's current discoveries to validate adjacency
    const { data: discoveries } = await sb
      .from("discoveries")
      .select("entity_id")
      .eq("session_id", session_id)
      .eq("player_name", player_name)
      .eq("entity_type", "province_hex");

    const discoveredIds = new Set((discoveries || []).map((d: any) => d.entity_id));

    // 2. Load hex data for discovered hexes to get their coords
    if (discoveredIds.size === 0) {
      // No discoveries yet — allow bootstrap of any city hex the player owns
      const { data: cityCheck } = await sb
        .from("cities")
        .select("id")
        .eq("session_id", session_id)
        .eq("owner_player", player_name)
        .eq("province_q", q)
        .eq("province_r", r)
        .limit(1);
      
      if (!cityCheck || cityCheck.length === 0) {
        // Also allow (0,0) as fallback bootstrap
        if (q !== 0 || r !== 0) {
          return new Response(
            JSON.stringify({ error: "Nelze prozkoumat: nemáte žádné objevené provincie" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // Bootstrap allowed — skip adjacency check
    } else {
      // Check that target (q,r) is adjacent to at least one discovered hex
      const discoveredIdList = Array.from(discoveredIds);
      const BATCH = 200;
      let isAdjacent = false;

      for (let i = 0; i < discoveredIdList.length && !isAdjacent; i += BATCH) {
        const batch = discoveredIdList.slice(i, i + BATCH);
        const { data: hexData } = await sb
          .from("province_hexes")
          .select("q, r")
          .in("id", batch);

        if (hexData) {
          for (const h of hexData) {
            for (const [dq, dr] of NEIGHBORS) {
              if (h.q + dq === q && h.r + dr === r) {
                isAdjacent = true;
                break;
              }
            }
            if (isAdjacent) break;
          }
        }
      }

      if (!isAdjacent) {
        return new Response(
          JSON.stringify({ error: "Nelze prozkoumat: mimo hranici" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 3. Get-or-generate the hex via the generate-hex function logic
    //    We call the generate-hex function internally
    const funcUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-hex`;
    const hexRes = await fetch(funcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ session_id, q, r }),
    });

    if (!hexRes.ok) {
      const errText = await hexRes.text();
      throw new Error(`generate-hex failed: ${errText}`);
    }

    const hex = await hexRes.json();

    // 4. Insert discovery record
    await sb.from("discoveries").upsert({
      session_id,
      player_name,
      entity_type: "province_hex",
      entity_id: hex.id,
      source: "explore",
    }, { onConflict: "session_id,player_name,entity_type,entity_id" });

    return new Response(JSON.stringify({ hex, discovered: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
