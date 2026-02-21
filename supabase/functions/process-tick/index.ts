import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Support both single-session call and cron (all persistent sessions)
    let sessionIds: string[] = [];
    try {
      const body = await req.json();
      if (body?.sessionId) sessionIds = [body.sessionId];
    } catch { /* empty body from cron */ }

    if (sessionIds.length === 0) {
      // Cron mode: find all time_persistent sessions with server_config
      const { data: configs } = await supabase
        .from("server_config")
        .select("session_id");
      sessionIds = (configs || []).map((c: any) => c.session_id);
    }

    const results: Record<string, any> = {};
    const now = new Date().toISOString();

    for (const sessionId of sessionIds) {
      // 1. Complete pending actions
      const { data: completedActions } = await supabase
        .from("action_queue")
        .update({ status: "completed" })
        .eq("session_id", sessionId)
        .eq("status", "pending")
        .lte("completes_at", now)
        .select("id");

      // 2. Complete travel orders
      const { data: arrivedOrders } = await supabase
        .from("travel_orders")
        .update({ status: "arrived" })
        .eq("session_id", sessionId)
        .eq("status", "in_transit")
        .lte("arrives_at", now)
        .select("id, entity_id, to_province_id");

      // Move arrived armies to destination province
      for (const order of arrivedOrders || []) {
        if (order.entity_id && order.to_province_id) {
          await supabase.from("military_stacks")
            .update({ province_id: order.to_province_id })
            .eq("id", order.entity_id);
        }
      }

      // 3. Auto-generate crisis events
      const { data: cities } = await supabase.from("cities").select("*").eq("session_id", sessionId);
      const famineCities = (cities || []).filter((c: any) => c.famine_turn);
      const unstableCities = (cities || []).filter((c: any) => (c.city_stability || 70) < 30);
      let generatedEvents = 0;

      if (famineCities.length >= 3 && Math.random() < 0.3) {
        await supabase.from("game_events").insert({
          session_id: sessionId,
          event_type: "crisis",
          player: "Systém",
          note: `Rozsáhlý hladomor zasáhl ${famineCities.length} měst. Lid se bouří.`,
          location: famineCities[0]?.name,
          importance: "critical",
          confirmed: true,
          turn_number: 0,
        });
        generatedEvents++;
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
        generatedEvents++;
      }

      // 4. Reset expired time pools
      await supabase
        .from("time_pools")
        .update({ used_minutes: 0, resets_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .eq("session_id", sessionId)
        .lte("resets_at", now);

      // 5. Check inactivity & auto-delegate
      const { data: config } = await supabase.from("server_config")
        .select("inactivity_threshold_hours, delegation_enabled")
        .eq("session_id", sessionId).single();

      if (config?.delegation_enabled) {
        const thresholdMs = (config.inactivity_threshold_hours || 48) * 60 * 60 * 1000;
        const cutoff = new Date(Date.now() - thresholdMs).toISOString();

        // Auto-delegate inactive players
        await supabase.from("player_activity")
          .update({ is_delegated: true, delegated_to: "AI" })
          .eq("session_id", sessionId)
          .eq("is_delegated", false)
          .lt("last_action_at", cutoff);
      }

      results[sessionId] = {
        completedActions: (completedActions || []).length,
        arrivedOrders: (arrivedOrders || []).length,
        generatedEvents,
      };
    }

    return new Response(JSON.stringify({ ok: true, processed: sessionIds.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
