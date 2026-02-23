import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, factionName } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch faction data
    const { data: faction } = await supabase.from("ai_factions")
      .select("*")
      .eq("session_id", sessionId)
      .eq("faction_name", factionName)
      .eq("is_active", true)
      .single();

    if (!faction) {
      return new Response(JSON.stringify({ error: "Faction not found or inactive" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch session info
    const { data: session } = await supabase.from("game_sessions")
      .select("current_turn, epoch_style").eq("id", sessionId).single();
    if (!session) throw new Error("Session not found");

    // Fetch faction's cities
    const { data: cities } = await supabase.from("cities")
      .select("name, level, status, population_total")
      .eq("session_id", sessionId)
      .eq("owner_player", factionName);

    // Fetch recent events (last 3 turns)
    const { data: recentEvents } = await supabase.from("game_events")
      .select("event_type, player, turn_number, note, result, location")
      .eq("session_id", sessionId)
      .eq("confirmed", true)
      .gte("turn_number", Math.max(1, session.current_turn - 3))
      .order("turn_number", { ascending: false })
      .limit(20);

    // Fetch world summary
    const { data: worldSummary } = await supabase.from("ai_world_summaries")
      .select("summary_text, key_facts")
      .eq("session_id", sessionId)
      .eq("summary_type", "world_state")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Fetch faction resources from realm_resources (source of truth for reserves)
    const { data: realmRes } = await supabase.from("realm_resources")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", factionName)
      .maybeSingle();

    const resMap: Record<string, any> = {
      grain: { stockpile: realmRes?.grain_reserve || 0, capacity: realmRes?.granary_capacity || 0 },
      wood: { stockpile: realmRes?.wood_reserve || 0 },
      stone: { stockpile: realmRes?.stone_reserve || 0 },
      iron: { stockpile: realmRes?.iron_reserve || 0 },
      gold: { stockpile: realmRes?.gold_reserve || 0 },
      manpower: { pool: realmRes?.manpower_pool || 0 },
    };

    const systemPrompt = `Jsi AI řídící frakci "${factionName}" v civilizační strategické hře.

OSOBNOST: ${faction.personality}
CÍLE: ${JSON.stringify(faction.goals)}
POSTOJ K HRÁČI: ${JSON.stringify(faction.disposition)}

PRAVIDLA:
- Rozhoduj se logicky na základě osobnosti a cílů.
- Bere v úvahu aktuální stav zdrojů a měst.
- Zohledni nedávné události.
- Nesmíš provádět více než 3 akce za kolo.
- Akce musí být proveditelné (nemůžeš stavět bez zdrojů).
- Odpověz POUZE voláním funkce faction_turn.
- Vše v ČEŠTINĚ.`;

    const userPrompt = `ROK: ${session.current_turn}

MĚSTA FRAKCE:
${JSON.stringify(cities || [], null, 2)}

ZDROJE:
${JSON.stringify(resMap, null, 2)}

NEDÁVNÉ UDÁLOSTI:
${JSON.stringify(recentEvents || [], null, 2)}

STAV SVĚTA:
${worldSummary?.summary_text || "Žádný souhrn"}

Rozhodni se, co frakce udělá v tomto kole.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "faction_turn",
            description: "Submit faction decisions for this turn.",
            parameters: {
              type: "object",
              properties: {
                actions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      actionType: { type: "string", enum: ["build", "trade", "diplomacy", "expand", "explore"] },
                      description: { type: "string" },
                      targetCity: { type: "string" },
                      targetFaction: { type: "string" },
                      narrativeNote: { type: "string", description: "Short narrative flavor text" },
                    },
                    required: ["actionType", "description"],
                    additionalProperties: false,
                  },
                  maxItems: 3,
                },
                dispositionChanges: {
                  type: "object",
                  description: "Changes to disposition toward other factions: { factionName: delta }",
                },
                internalThought: {
                  type: "string",
                  description: "Brief internal reasoning (for debug/narrative)",
                },
              },
              required: ["actions", "internalThought"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "faction_turn" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call");

    const result = JSON.parse(toolCall.function.arguments);

    // Persist actions as game events
    for (const action of result.actions || []) {
      await supabase.from("game_events").insert({
        session_id: sessionId,
        event_type: action.actionType || "other",
        player: factionName,
        turn_number: session.current_turn,
        confirmed: true,
        note: action.description,
        location: action.targetCity || null,
        result: action.narrativeNote || null,
        importance: "normal",
        truth_state: "canon",
      });
    }

    // Update disposition
    if (result.dispositionChanges) {
      const newDisposition = { ...faction.disposition };
      for (const [target, delta] of Object.entries(result.dispositionChanges)) {
        newDisposition[target] = ((newDisposition[target] as number) || 0) + (delta as number);
      }
      await supabase.from("ai_factions")
        .update({ disposition: newDisposition })
        .eq("id", faction.id);
    }

    // Log
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: factionName,
      turn_number: session.current_turn,
      action_type: "other",
      description: `AI frakce ${factionName}: ${result.actions?.length || 0} akcí. ${result.internalThought || ""}`,
    });

    // Trigger process-turn for AI faction (economy pipeline)
    const processTurnUrl = `${supabaseUrl}/functions/v1/process-turn`;
    try {
      await fetch(processTurnUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, playerName: factionName }),
      });
    } catch (ptErr) {
      console.warn("process-turn for AI faction failed:", ptErr);
    }

    return new Response(JSON.stringify({
      faction: factionName,
      actionsCount: result.actions?.length || 0,
      actions: result.actions,
      internalThought: result.internalThought,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-faction-turn error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
