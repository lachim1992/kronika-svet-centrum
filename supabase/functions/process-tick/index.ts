import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Missing sessionId");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get server config
    const { data: config } = await supabase
      .from("server_config")
      .select("*")
      .eq("session_id", sessionId)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: "No server config" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Complete pending actions whose time has elapsed
    const now = new Date().toISOString();
    const { data: completedActions } = await supabase
      .from("action_queue")
      .update({ status: "completed" })
      .eq("session_id", sessionId)
      .eq("status", "pending")
      .lte("completes_at", now)
      .select();

    // 3. Generate world events based on tension
    const { data: cities } = await supabase
      .from("cities")
      .select("*")
      .eq("session_id", sessionId);

    const { data: crises } = await supabase
      .from("world_crises")
      .select("*")
      .eq("session_id", sessionId)
      .eq("resolved", false);

    const famineCities = (cities || []).filter((c: any) => c.famine_turn);
    const unstableCities = (cities || []).filter((c: any) => (c.city_stability || 70) < 30);

    const generatedEvents: string[] = [];

    // Auto-generate crisis events if instability is high
    if (famineCities.length >= 3 && Math.random() < 0.3) {
      const { data: evt } = await supabase.from("game_events").insert({
        session_id: sessionId,
        event_type: "crisis",
        player: "Systém",
        note: `Rozsáhlý hladomor zasáhl ${famineCities.length} měst. Lid se bouří.`,
        location: famineCities[0]?.name,
        importance: "critical",
        confirmed: true,
        turn_number: 0,
      }).select("id").single();
      if (evt) generatedEvents.push(evt.id);
    }

    if (unstableCities.length >= 2 && Math.random() < 0.2) {
      const city = unstableCities[Math.floor(Math.random() * unstableCities.length)];
      await supabase.from("game_events").insert({
        session_id: sessionId,
        event_type: "rebellion",
        player: "Systém",
        note: `Povstání v ${city.name}! Stabilita klesla na ${city.city_stability}.`,
        location: city.name,
        importance: "critical",
        confirmed: true,
        turn_number: 0,
      });
      generatedEvents.push("rebellion_" + city.id);
    }

    // 4. Reset expired time pools
    await supabase
      .from("time_pools")
      .update({ used_minutes: 0, resets_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
      .eq("session_id", sessionId)
      .lte("resets_at", now);

    return new Response(JSON.stringify({
      ok: true,
      completedActions: (completedActions || []).length,
      generatedEvents: generatedEvents.length,
      timePoolsReset: true,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
