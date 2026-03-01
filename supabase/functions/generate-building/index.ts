import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, cityId, playerDescription, buildingMyth, visualDescription, cityName, cityLevel, biome, buildSpeedModifier: explicitMod } = await req.json();

    if (!sessionId || !cityId || !playerDescription) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    let buildSpeedModifier = explicitMod || 0;
    let architecturalStyle = "";
    let culturalQuirk = "";

    if (sessionId && cityId) {
      const { data: city } = await sb.from("cities").select("owner_player").eq("id", cityId).maybeSingle();
      if (city?.owner_player) {
        const { data: civ } = await sb.from("civilizations")
          .select("civ_bonuses, architectural_style, cultural_quirk")
          .eq("session_id", sessionId).eq("player_name", city.owner_player).maybeSingle();
        if (civ) {
          const bonuses = (civ.civ_bonuses as Record<string, number>) || {};
          if (!explicitMod && bonuses.build_speed_modifier) buildSpeedModifier = bonuses.build_speed_modifier;
          architecturalStyle = civ.architectural_style || "";
          culturalQuirk = civ.cultural_quirk || "";
        }
      }
    }

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify(getDefaultBuilding(playerDescription)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a medieval building designer for a civilization strategy game. Based on the player's description, generate a building with 5 UPGRADE LEVELS.

RULES:
- Category must be one of: economic, military, cultural, religious, infrastructure
- Level 1 = base building. Each subsequent level adds +50-100% effects AND unlocks a NEW bonus.
- Level 5 = WONDER OF THE WORLD transformation — massive bonuses + global influence.
- Effects keys: grain_production, iron_production, wood_production, stone_production, wealth, stability, influence, defense, recruitment, military_quality, military_garrison, morale_bonus, trade_bonus, granary_capacity, population_capacity, legitimacy, cleric_attraction, burgher_attraction, disease_resistance, siege_power, siege_resistance, cavalry_bonus, ranged_bonus, mobility, vision, espionage_defense, special_production, naval_power, research
- Costs escalate: Lvl2=2x, Lvl3=4x, Lvl4=8x, Lvl5=16x of base
- Generate ALL text in Czech language
- Level names should evolve (e.g. Kovárna → Zbrojnice → Arsenal → Královská zbrojírna → Legenda Oceli)
- Level 5 name should sound legendary/mythical
- Each level has an "unlock" text describing the new bonus

Respond ONLY with valid JSON.`;

    const userPrompt = `Player's building idea: "${playerDescription}"
${buildingMyth ? `Player's founding myth (THIS IS THE MOST IMPORTANT INPUT — you MUST faithfully rewrite it into epic style while preserving ALL key elements, characters, and motivations from the original): "${buildingMyth}"` : ""}
${visualDescription ? `Visual: "${visualDescription}"` : ""}
${architecturalStyle ? `Architecture style (MUST influence design): "${architecturalStyle}"` : ""}
${culturalQuirk ? `Cultural tradition: "${culturalQuirk}"` : ""}
City: "${cityName || "Settlement"}" (level: ${cityLevel || "HAMLET"})
Biome: "${biome || "plains"}"

Generate building JSON with 5-level upgrade system:
{
  "name": "<Czech name for level 1>",
  "category": "<economic|military|cultural|religious|infrastructure>",
  "description": "<1-2 sentences Czech>",
  "flavor_text": "<1 atmospheric sentence Czech>",
  "founding_myth": "<CRITICAL: If the player provided a founding myth above, you MUST rewrite it faithfully into an epic, legendary style (2-4 sentences Czech). Preserve the player's original story, characters, and meaning. Do NOT invent a completely new myth. If no myth was provided, write a short origin legend inspired by the building concept.>",
  "cost_wood": <int 0-15>,
  "cost_stone": <int 0-15>,
  "cost_iron": <int 0-10>,
  "cost_wealth": <int 0-30>,
  "build_duration": <int 1-4>,
  "effects": { <level 1 effects, moderate values> },
  "level_data": [
    {"level": 1, "name": "<Czech>", "effects": {<same as base>}, "cost_mult": 1, "unlock": "<what Lvl1 provides>"},
    {"level": 2, "name": "<Czech>", "effects": {<+50-80% of lvl1>}, "cost_mult": 2, "unlock": "<new bonus description>"},
    {"level": 3, "name": "<Czech>", "effects": {<+100% of lvl1 + new effect>}, "cost_mult": 4, "unlock": "<new bonus>"},
    {"level": 4, "name": "<Czech>", "effects": {<+200% of lvl1 + 2 new effects>}, "cost_mult": 8, "unlock": "<powerful new bonus>"},
    {"level": 5, "name": "<LEGENDARY Czech name>", "effects": {<massive + global_influence + diplomatic_prestige>}, "cost_mult": 16, "unlock": "<Div světa: popis legendárního bonusu>"}
  ],
  "image_prompt": "<English prompt for medieval illustration>"
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
        max_tokens: 2500,
      }),
    });

    if (!aiRes.ok) {
      console.error("AI API error:", await aiRes.text());
      return new Response(JSON.stringify(getDefaultBuilding(playerDescription)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify(getDefaultBuilding(playerDescription)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = validateBuilding(parsed);

    if (buildSpeedModifier && buildSpeedModifier !== 0) {
      result.build_duration = Math.max(1, Math.round(result.build_duration * (1 + buildSpeedModifier)));
    }

    // Generate image
    const parts: string[] = [];
    parts.push(`Medieval fantasy building illustration of "${result.name}".`);
    if (architecturalStyle) parts.push(`Architecture style: ${architecturalStyle}.`);
    if (playerDescription) parts.push(`Concept: ${playerDescription}.`);
    if (buildingMyth) parts.push(`Legend: ${buildingMyth}.`);
    if (visualDescription) parts.push(`Visual: ${visualDescription}.`);
    parts.push(`Setting: ${cityName || "settlement"}, ${biome || "plains"} biome.`);
    parts.push("Dark moody atmosphere, dramatic lighting, highly detailed architecture, epic fantasy painterly style.");

    try {
      const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: parts.join(" ") }],
          modalities: ["image", "text"],
        }),
      });

      if (imgRes.ok) {
        const imgData = await imgRes.json();
        const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageUrl) {
          const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
          const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const filePath = `buildings/${sessionId}/${crypto.randomUUID()}.png`;
          const { error: uploadErr } = await sb.storage.from("building-images").upload(filePath, bytes, {
            contentType: "image/png", upsert: true,
          });
          if (!uploadErr) {
            const { data: urlData } = sb.storage.from("building-images").getPublicUrl(filePath);
            result.image_url = urlData.publicUrl;
          } else {
            result.image_url = imageUrl;
          }
        }
      }
    } catch (imgErr) {
      console.error("Image generation error:", imgErr);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-building error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getDefaultBuilding(desc: string) {
  return {
    name: "Nová stavba",
    category: "economic",
    description: desc || "Stavba založená hráčem.",
    flavor_text: "", founding_myth: "",
    cost_wood: 5, cost_stone: 3, cost_iron: 0, cost_wealth: 10,
    build_duration: 1,
    effects: { wealth: 2, stability: 2 },
    level_data: [
      { level: 1, name: "Nová stavba", effects: { wealth: 2, stability: 2 }, cost_mult: 1, unlock: "Základní stavba" },
      { level: 2, name: "Vylepšená stavba", effects: { wealth: 4, stability: 4 }, cost_mult: 2, unlock: "Zdvojnásobení efektů" },
      { level: 3, name: "Pokročilá stavba", effects: { wealth: 7, stability: 7, influence: 3 }, cost_mult: 4, unlock: "Vliv +3" },
      { level: 4, name: "Mistrovská stavba", effects: { wealth: 12, stability: 12, influence: 6 }, cost_mult: 8, unlock: "Mistrovská úroveň" },
      { level: 5, name: "Div světa", effects: { wealth: 20, stability: 20, influence: 15, global_influence: 10 }, cost_mult: 16, unlock: "Div světa: globální vliv" },
    ],
    image_prompt: "A medieval building, watercolor style",
    image_url: null,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val || 0)));
}

function validateBuilding(p: any) {
  const categories = ["economic", "military", "cultural", "religious", "infrastructure"];
  const e = p.effects || {};
  const name = (p.name || "Nová stavba").slice(0, 100);
  const nameLC = name.toLowerCase();
  const ARENA_KEYWORDS = ["aréna", "arena", "amfiteátr", "colosseum", "koloseum", "gladiátor"];
  const STADIUM_KEYWORDS = ["stadion", "závodiště", "hippodrome", "hippodrom", "hřiště", "sphaera"];
  const isArena = ARENA_KEYWORDS.some(kw => nameLC.includes(kw));
  const isStadium = STADIUM_KEYWORDS.some(kw => nameLC.includes(kw));
  const tags: string[] = [];
  if (isArena) tags.push("arena");
  if (isStadium) tags.push("stadium");
  if (nameLC.includes("akademi") || nameLC.includes("škola") || nameLC.includes("gymnasium")) tags.push("academy");

  return {
    name,
    category: categories.includes(p.category) ? p.category : "economic",
    description: (p.description || "").slice(0, 500),
    flavor_text: (p.flavor_text || "").slice(0, 300),
    founding_myth: (p.founding_myth || "").slice(0, 1000),
    cost_wood: clamp(p.cost_wood, 0, 15),
    cost_stone: clamp(p.cost_stone, 0, 15),
    cost_iron: clamp(p.cost_iron, 0, 10),
    cost_wealth: clamp(p.cost_wealth, 0, 30),
    build_duration: clamp(p.build_duration, 1, 4),
    effects: e,
    level_data: Array.isArray(p.level_data) ? p.level_data : [],
    image_prompt: (p.image_prompt || "").slice(0, 500),
    image_url: null as string | null,
    is_arena: isArena,
    building_tags: tags,
  };
}
