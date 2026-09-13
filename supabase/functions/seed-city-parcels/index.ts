import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { seatCityOnParcels } from "../_shared/citySeat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * seed-city-parcels — gives every city of a session its footprint on the 32 sub-parcel grid.
 * Idempotent: a city that already has a seat parcel only gets topped up to the size its
 * population deserves. Body: { session_id }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Přihlášení je vyžadováno" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Neplatná session" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.session_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: "session_id je povinné" }, 400);

    const { data: membership } = await sb.from("game_memberships")
      .select("id").eq("session_id", sessionId).eq("user_id", user.id).maybeSingle();
    if (!membership) return json({ error: "Nejste členem této hry" }, 403);

    const { data: session } = await sb.from("game_sessions")
      .select("current_turn").eq("id", sessionId).maybeSingle();
    const turnNumber = Number(session?.current_turn || 1);

    const { data: cities } = await sb.from("cities")
      .select("id, name, owner_player, grid_x, grid_y, province_q, province_r, population_total, founded_parcel_index")
      .eq("session_id", sessionId);

    const seeded: Array<{ city: string; seatIndex: number | null; claimed: number }> = [];
    for (const city of cities || []) {
      const gridX = city.grid_x ?? city.province_q;
      const gridY = city.grid_y ?? city.province_r;
      if (gridX === null || gridY === null) continue;
      const result = await seatCityOnParcels(sb, {
        sessionId,
        cityId: city.id,
        cityName: city.name,
        ownerPlayer: city.owner_player,
        gridX,
        gridY,
        population: Number(city.population_total || 0),
        turnNumber,
        preferredIndex: city.founded_parcel_index ?? null,
      });
      if (result.seatIndex !== null && city.founded_parcel_index !== result.seatIndex) {
        await sb.from("cities").update({ founded_parcel_index: result.seatIndex }).eq("id", city.id);
      }
      seeded.push({ city: city.name, seatIndex: result.seatIndex, claimed: result.claimed });
    }

    return json({ ok: true, cities: seeded.length, seeded });
  } catch (error) {
    console.error("seed-city-parcels error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
