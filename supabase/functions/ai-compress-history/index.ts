import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, currentTurn, tier } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Memory window: free=5 turns, premium=20 turns
    const memoryWindow = tier === "premium" ? 20 : 5;
    const compressBeforeTurn = currentTurn - memoryWindow;

    if (compressBeforeTurn <= 0) {
      return new Response(JSON.stringify({ compressed: false, reason: "Not enough history to compress" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already compressed for this range
    const { data: existing } = await supabase.from("ai_world_summaries")
      .select("id")
      .eq("session_id", sessionId)
      .eq("summary_type", "era_recap")
      .gte("turn_range_to", compressBeforeTurn)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ compressed: false, reason: "Already compressed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch old events to compress (before memory window)
    const { data: oldEvents } = await supabase.from("game_events")
      .select("event_type, player, turn_number, note, result, location, importance")
      .eq("session_id", sessionId)
      .eq("confirmed", true)
      .lt("turn_number", compressBeforeTurn)
      .order("turn_number", { ascending: true })
      .limit(100);

    if (!oldEvents || oldEvents.length === 0) {
      return new Response(JSON.stringify({ compressed: false, reason: "No old events to compress" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch world memories for context
    const { data: memories } = await supabase.from("world_memories")
      .select("fact_text, category")
      .eq("session_id", sessionId)
      .eq("approved", true)
      .limit(20);

    // Group events by 5-turn eras
    const eras: Record<string, typeof oldEvents> = {};
    for (const evt of oldEvents) {
      const eraStart = Math.floor((evt.turn_number - 1) / 5) * 5 + 1;
      const eraEnd = eraStart + 4;
      const key = `${eraStart}-${eraEnd}`;
      if (!eras[key]) eras[key] = [];
      eras[key].push(evt);
    }

    const summariesCreated: string[] = [];

    for (const [range, events] of Object.entries(eras)) {
      const [from, to] = range.split("-").map(Number);

      // Skip if already summarized
      const { data: alreadyExists } = await supabase.from("ai_world_summaries")
        .select("id")
        .eq("session_id", sessionId)
        .eq("summary_type", "era_recap")
        .eq("turn_range_from", from)
        .eq("turn_range_to", to)
        .limit(1);

      if (alreadyExists && alreadyExists.length > 0) continue;

      const prompt = `Jsi historický kronikář. Shrnout toto období (roky ${from}–${to}) do 1–2 odstavců.
Zaměř se na klíčové události, konflikty a změny.

UDÁLOSTI:
${JSON.stringify(events, null, 2)}

FAKTA O SVĚTĚ:
${(memories || []).map(m => `- ${m.fact_text}`).join("\n")}

Vrať JSON: { "summary": "...", "keyFacts": ["fakt1", "fakt2", ...] }`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Jsi historický kronikář. Odpovídej POUZE validním JSON." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        console.error(`AI error for era ${range}:`, response.status);
        continue;
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || "";
      
      // Clean markdown fences
      content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      let parsed: { summary: string; keyFacts: string[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { summary: content, keyFacts: [] };
      }

      await supabase.from("ai_world_summaries").insert({
        session_id: sessionId,
        summary_type: "era_recap",
        turn_range_from: from,
        turn_range_to: to,
        summary_text: parsed.summary,
        key_facts: parsed.keyFacts || [],
      });

      summariesCreated.push(range);
    }

    // Also create/update a current world_state summary
    const { data: recentEvents } = await supabase.from("game_events")
      .select("event_type, player, turn_number, note, result, location")
      .eq("session_id", sessionId)
      .eq("confirmed", true)
      .gte("turn_number", compressBeforeTurn)
      .order("turn_number", { ascending: false })
      .limit(30);

    const { data: factions } = await supabase.from("ai_factions")
      .select("faction_name, personality, disposition, goals")
      .eq("session_id", sessionId)
      .eq("is_active", true);

    const worldStatePrompt = `Vytvoř stručný souhrn aktuálního stavu světa (max 300 slov).

NEDÁVNÉ UDÁLOSTI (roky ${compressBeforeTurn}–${currentTurn}):
${JSON.stringify(recentEvents || [], null, 2)}

AKTIVNÍ FRAKCE:
${JSON.stringify(factions || [], null, 2)}

FAKTA:
${(memories || []).map(m => `- ${m.fact_text}`).join("\n")}

Vrať JSON: { "summary": "...", "keyFacts": ["fakt1", ...] }`;

    const wsResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Jsi historický kronikář. Odpovídej POUZE validním JSON." },
          { role: "user", content: worldStatePrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (wsResponse.ok) {
      const wsData = await wsResponse.json();
      let wsContent = wsData.choices?.[0]?.message?.content || "";
      wsContent = wsContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      let wsParsed: { summary: string; keyFacts: string[] };
      try {
        wsParsed = JSON.parse(wsContent);
      } catch {
        wsParsed = { summary: wsContent, keyFacts: [] };
      }

      // Upsert world state summary
      const { data: existingWS } = await supabase.from("ai_world_summaries")
        .select("id")
        .eq("session_id", sessionId)
        .eq("summary_type", "world_state")
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingWS && existingWS.length > 0) {
        await supabase.from("ai_world_summaries")
          .update({ summary_text: wsParsed.summary, key_facts: wsParsed.keyFacts || [] })
          .eq("id", existingWS[0].id);
      } else {
        await supabase.from("ai_world_summaries").insert({
          session_id: sessionId,
          summary_type: "world_state",
          summary_text: wsParsed.summary,
          key_facts: wsParsed.keyFacts || [],
        });
      }
    }

    return new Response(JSON.stringify({
      compressed: true,
      erasCompressed: summariesCreated,
      memoryWindow,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-compress-history error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
