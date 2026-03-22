import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, civDescription, worldPremise, tone, biomeName, settlementName } = await req.json();

    if (!sessionId || !playerName || !civDescription) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Return balanced defaults when no AI key
      return new Response(JSON.stringify(getDefaults()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = `You are a civilization start generator for a medieval/ancient strategy game. Based on the player's civilization description, generate balanced but flavorful starting conditions.

RULES:
- Resources must be balanced. Total resource points (grain + wood + stone + iron + horses + gold) should be between 60-120.
- A militaristic civ gets more iron/horses but less food. A trade civ gets more gold but less military.
- Settlement population should be 800-1500 for a starting hamlet.
- Population classes: peasants (60-80%), burghers (10-25%), clerics (5-15%).
- Stability 55-80.
- Special resource: one of "IRON", "STONE", "HORSES", or "NONE" based on the description.
- Generate a core_myth (1-2 sentences, Czech language), cultural_quirk (1 sentence, Czech), architectural_style (1-2 words, Czech).
- Resource income/upkeep must be sensible for turn-based economy.

Respond ONLY with valid JSON, no markdown.`;

    const userPrompt = `Civilization description: "${civDescription}"
World premise: "${worldPremise || "Medieval fantasy world"}"
Tone: "${tone || "mythic"}"
Biome: "${biomeName || "plains"}"
Settlement name: "${settlementName || "Starting settlement"}"
Player name: "${playerName}"

Generate starting conditions as JSON:
{
  "realm_resources": {
    "grain_reserve": <int 10-40>,
    "production_reserve": <int 20-80>,
    "horses_reserve": <int 0-15>,
    "gold_reserve": <int 50-200>,
    "faith_reserve": <int 0-20>,
    "stability": <int 55-80>,
    "granary_capacity": <int 300-800>,
    "stables_capacity": <int 50-200>
  },
  "settlement": {
    "population_total": <int 800-1500>,
    "population_peasants": <int>,
    "population_burghers": <int>,
    "population_clerics": <int>,
    "city_stability": <int 55-80>,
    "special_resource_type": "<IRON|STONE|HORSES|NONE>",
    "settlement_flavor": "<short Czech description of the settlement character>"
  },
  "civilization": {
    "core_myth": "<1-2 sentences in Czech>",
    "cultural_quirk": "<1 sentence in Czech>",
    "architectural_style": "<1-2 words in Czech>"
  }
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!aiRes.ok) {
      console.error("AI API error:", await aiRes.text());
      return new Response(JSON.stringify(getDefaults()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response (handle markdown wrapping)
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify(getDefaults()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate and clamp values
    const result = validateAndClamp(parsed);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-civ-start error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function getDefaults() {
  return {
    realm_resources: {
      grain_reserve: 20, production_reserve: 50,
      horses_reserve: 5, gold_reserve: 100, faith_reserve: 5,
      stability: 70, granary_capacity: 500, stables_capacity: 100,
    },
    settlement: {
      population_total: 1000, population_peasants: 800, population_burghers: 150, population_clerics: 50,
      city_stability: 70, special_resource_type: "NONE", settlement_flavor: "",
    },
    civilization: {
      core_myth: "", cultural_quirk: "", architectural_style: "",
    },
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val || 0)));
}

function validateAndClamp(parsed: any) {
  const defaults = getDefaults();
  const rr = parsed.realm_resources || {};
  const st = parsed.settlement || {};
  const cv = parsed.civilization || {};

  const popTotal = clamp(st.population_total || 1000, 800, 1500);
  const peasants = clamp(st.population_peasants || Math.round(popTotal * 0.75), Math.round(popTotal * 0.5), Math.round(popTotal * 0.85));
  const clerics = clamp(st.population_clerics || Math.round(popTotal * 0.05), Math.round(popTotal * 0.03), Math.round(popTotal * 0.15));
  const burghers = popTotal - peasants - clerics;

  return {
    realm_resources: {
      grain_reserve: clamp(rr.grain_reserve, 10, 40),
      production_reserve: clamp(rr.production_reserve, 20, 80),
      horses_reserve: clamp(rr.horses_reserve, 0, 15),
      gold_reserve: clamp(rr.gold_reserve, 50, 200),
      faith_reserve: clamp(rr.faith_reserve, 0, 20),
      stability: clamp(rr.stability, 55, 80),
      granary_capacity: clamp(rr.granary_capacity, 300, 800),
      stables_capacity: clamp(rr.stables_capacity, 50, 200),
    },
    settlement: {
      population_total: popTotal,
      population_peasants: peasants,
      population_burghers: burghers,
      population_clerics: clerics,
      city_stability: clamp(st.city_stability, 55, 80),
      special_resource_type: ["IRON", "STONE", "HORSES", "NONE"].includes(st.special_resource_type) ? st.special_resource_type : "NONE",
      settlement_flavor: (st.settlement_flavor || "").slice(0, 500),
    },
    civilization: {
      core_myth: (cv.core_myth || "").slice(0, 500),
      cultural_quirk: (cv.cultural_quirk || "").slice(0, 300),
      architectural_style: (cv.architectural_style || "").slice(0, 100),
    },
  };
}
