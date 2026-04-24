import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * generate-geo-blueprint
 *
 * @deprecated since Inkrement 3 — replaced by `translate-premise-to-spec`
 * which produces the full WorldgenSpecV1 (incl. derived geographyBlueprint)
 * from a single premise input. Kept for back-compat with legacy world setup
 * paths; new flows MUST NOT call this endpoint.
 *
 * Reads the world_premise lore_bible and generates a geography_blueprint
 * using AI, then saves it to world_premise.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id, map_width, map_height } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load world premise
    const { data: premise } = await sb
      .from("world_premise")
      .select("id, lore_bible, world_vibe, cosmology, economic_bias, geography_blueprint")
      .eq("session_id", session_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!premise?.lore_bible) {
      return new Response(JSON.stringify({ error: "No lore_bible found for this session" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const halfW = Math.floor((map_width || 31) / 2);
    const halfH = Math.floor((map_height || 31) / 2);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a world geography designer for a strategy game. 
Given a world description (lore bible) and map dimensions, generate a geography blueprint JSON.

The map uses axial hex coordinates centered at (0,0), ranging from (-${halfW}, -${halfH}) to (${halfW}, ${halfH}).

Output a JSON object with these optional fields:
{
  "ridges": [{ "name": "string", "x1": number, "y1": number, "x2": number, "y2": number, "width": 2-5, "strength": 0.4-0.9 }],
  "biomeZones": [{ "name": "string", "centerQ": number, "centerR": number, "radius": 3-15, "biome": "plains"|"forest"|"hills"|"desert"|"swamp"|"tundra", "strength": 0.5-0.9 }],
  "continentShape": "pangaea"|"archipelago"|"two_continents"|"crescent",
  "climateGradient": "north_cold"|"south_cold"|"equatorial"|"uniform",
  "oceanPattern": "central_sea"|"border_ocean"|"inland_lakes",
  "biomeWeights": { "plains": 0-2, "forest": 0-2, "hills": 0-2, "desert": 0-2, "swamp": 0-2, "tundra": 0-2 },
  "targetLandRatio": 0.3-0.7,
  "continentCount": 1-5,
  "mountainDensity": 0.1-0.8,
  "coastalRichness": 0.2-0.8
}

Rules:
- Place biome zones near where factions should start based on their description
- Maritime factions need coastal zones with plains nearby
- Agricultural factions need large plains zones
- Place mountain ridges as natural barriers between factions
- Keep coordinates within the map bounds
- Use 2-5 ridges and 3-8 biome zones typically
- Ensure start areas are at least 6 hexes apart
- Return ONLY valid JSON, no markdown or explanation`;

    const userPrompt = `World Description:
${premise.lore_bible}

World vibe: ${premise.world_vibe || "realistic"}
Economic bias: ${premise.economic_bias || "balanced"}
Map size: ${map_width || 31}x${map_height || 31} (hex coords: -${halfW} to ${halfW}, -${halfH} to ${halfH})

Generate a geography blueprint that reflects this world's lore, factions, and narrative.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "set_geography_blueprint",
            description: "Set the geography blueprint for world map generation",
            parameters: {
              type: "object",
              properties: {
                ridges: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      x1: { type: "number" }, y1: { type: "number" },
                      x2: { type: "number" }, y2: { type: "number" },
                      width: { type: "number" }, strength: { type: "number" },
                    },
                    required: ["x1", "y1", "x2", "y2"],
                  },
                },
                biomeZones: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      centerQ: { type: "number" }, centerR: { type: "number" },
                      radius: { type: "number" },
                      biome: { type: "string", enum: ["plains", "forest", "hills", "desert", "swamp", "tundra"] },
                      strength: { type: "number" },
                    },
                    required: ["centerQ", "centerR", "radius", "biome"],
                  },
                },
                continentShape: { type: "string", enum: ["pangaea", "archipelago", "two_continents", "crescent"] },
                climateGradient: { type: "string", enum: ["north_cold", "south_cold", "equatorial", "uniform"] },
                oceanPattern: { type: "string", enum: ["central_sea", "border_ocean", "inland_lakes"] },
                biomeWeights: {
                  type: "object",
                  properties: {
                    plains: { type: "number" }, forest: { type: "number" },
                    hills: { type: "number" }, desert: { type: "number" },
                    swamp: { type: "number" }, tundra: { type: "number" },
                  },
                },
                targetLandRatio: { type: "number" },
                continentCount: { type: "number" },
                mountainDensity: { type: "number" },
                coastalRichness: { type: "number" },
              },
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "set_geography_blueprint" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required for AI" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured blueprint");
    }

    let blueprint: Record<string, any>;
    try {
      blueprint = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      throw new Error("Failed to parse AI blueprint JSON");
    }

    // Extract settings that go to terrain_params (not into geography_blueprint)
    const terrainSettings: Record<string, any> = {};
    if (blueprint.biomeWeights) terrainSettings.biomeWeights = blueprint.biomeWeights;
    if (blueprint.targetLandRatio) terrainSettings.targetLandRatio = blueprint.targetLandRatio;
    if (blueprint.continentCount) terrainSettings.continentCount = blueprint.continentCount;
    if (blueprint.mountainDensity) terrainSettings.mountainDensity = blueprint.mountainDensity;
    if (blueprint.coastalRichness) terrainSettings.coastalRichness = blueprint.coastalRichness;

    // The rest is the actual geography blueprint
    const geoBlueprint: Record<string, any> = {};
    if (blueprint.ridges) geoBlueprint.ridges = blueprint.ridges;
    if (blueprint.biomeZones) geoBlueprint.biomeZones = blueprint.biomeZones;
    if (blueprint.continentShape) geoBlueprint.continentShape = blueprint.continentShape;
    if (blueprint.climateGradient) geoBlueprint.climateGradient = blueprint.climateGradient;
    if (blueprint.oceanPattern) geoBlueprint.oceanPattern = blueprint.oceanPattern;

    // Save blueprint to world_premise
    const { error: updateErr } = await sb
      .from("world_premise")
      .update({ geography_blueprint: geoBlueprint })
      .eq("id", premise.id);

    if (updateErr) {
      console.error("Failed to save blueprint:", updateErr);
      throw new Error("Failed to save blueprint");
    }

    return new Response(JSON.stringify({
      blueprint: geoBlueprint,
      terrainSettings,
      message: "Geography blueprint generated from world lore",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-geo-blueprint error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
