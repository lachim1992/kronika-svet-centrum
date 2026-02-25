import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, cityId, playerDescription, buildingMyth, visualDescription, cityName, cityLevel, biome } = await req.json();

    if (!sessionId || !cityId || !playerDescription) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify(getDefaultBuilding(playerDescription)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a medieval building designer for a civilization strategy game. Based on the player's description, generate a realistic building with balanced economic effects.

RULES:
- Category must be one of: economic, military, cultural, religious, infrastructure
- Effects are a JSON object with numeric values. Valid keys:
  food_income (0-4), wood_income (0-4), stone_income (0-3), iron_income (0-3),
  wealth_income (0-5), stability_bonus (0-10), influence_bonus (0-10),
  population_growth (0-2), manpower_bonus (0-20), defense_bonus (0-25)
- Costs must be balanced: more powerful effects = higher costs
- Build duration: 1-4 turns based on complexity
- Generate name, description, flavor_text, founding_myth in Czech language
- Generate an image_prompt in English for medieval illustration style
- All text must reflect the player's vision while staying balanced

Respond ONLY with valid JSON, no markdown.`;

    const userPrompt = `Player's building idea: "${playerDescription}"
${buildingMyth ? `Founding myth/story: "${buildingMyth}"` : ""}
${visualDescription ? `Visual appearance: "${visualDescription}"` : ""}
City: "${cityName || "Settlement"}" (level: ${cityLevel || "HAMLET"})
Biome: "${biome || "plains"}"

Generate building as JSON:
{
  "name": "<Czech name>",
  "category": "<economic|military|cultural|religious|infrastructure>",
  "description": "<1-2 sentences in Czech describing function>",
  "flavor_text": "<1 atmospheric sentence in Czech>",
  "founding_myth": "<2-4 sentences in Czech, incorporating player's myth if provided>",
  "cost_wood": <int 0-15>,
  "cost_stone": <int 0-15>,
  "cost_iron": <int 0-10>,
  "cost_wealth": <int 0-30>,
  "build_duration": <int 1-4>,
  "effects": {
    "food_income": <int 0-4>,
    "wood_income": <int 0-4>,
    "stone_income": <int 0-3>,
    "iron_income": <int 0-3>,
    "wealth_income": <int 0-5>,
    "stability_bonus": <int 0-10>,
    "influence_bonus": <int 0-10>,
    "population_growth": <float 0-2>,
    "manpower_bonus": <int 0-20>,
    "defense_bonus": <int 0-25>
  },
  "image_prompt": "<English prompt for medieval building illustration>"
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

    // Generate image primarily from player's own inputs
    const parts: string[] = [];
    parts.push(`Medieval fantasy building illustration of "${result.name}".`);
    if (playerDescription) parts.push(`Building concept: ${playerDescription}.`);
    if (buildingMyth) parts.push(`Legend and story: ${buildingMyth}.`);
    if (visualDescription) parts.push(`Visual style and appearance: ${visualDescription}.`);
    parts.push(`Setting: ${cityName || "settlement"}, ${biome || "plains"} biome.`);
    parts.push("Dark moody atmosphere, dramatic lighting, highly detailed architecture, epic fantasy painterly style, cinematic composition.");
    const imagePrompt = parts.join(" ");

    try {
      const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (imgRes.ok) {
        const imgData = await imgRes.json();
        const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageUrl) {
          // Store the base64 image in Supabase storage
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const sb = createClient(supabaseUrl, supabaseKey);

          const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
          const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const filePath = `buildings/${sessionId}/${crypto.randomUUID()}.png`;

          const { error: uploadErr } = await sb.storage.from("building-images").upload(filePath, bytes, {
            contentType: "image/png",
            upsert: true,
          });

          if (!uploadErr) {
            const { data: urlData } = sb.storage.from("building-images").getPublicUrl(filePath);
            result.image_url = urlData.publicUrl;
          } else {
            console.error("Storage upload error:", uploadErr);
            // Fallback: return base64 directly (will be stored in DB)
            result.image_url = imageUrl;
          }
        }
      }
    } catch (imgErr) {
      console.error("Image generation error:", imgErr);
      // Continue without image - not critical
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
    flavor_text: "",
    founding_myth: "",
    cost_wood: 5,
    cost_stone: 3,
    cost_iron: 0,
    cost_wealth: 10,
    build_duration: 1,
    effects: { wealth_income: 1, stability_bonus: 2 },
    image_prompt: "A medieval building in a small settlement, watercolor style",
    image_url: null,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val || 0)));
}

function validateBuilding(p: any) {
  const categories = ["economic", "military", "cultural", "religious", "infrastructure"];
  const e = p.effects || {};
  return {
    name: (p.name || "Nová stavba").slice(0, 100),
    category: categories.includes(p.category) ? p.category : "economic",
    description: (p.description || "").slice(0, 500),
    flavor_text: (p.flavor_text || "").slice(0, 300),
    founding_myth: (p.founding_myth || "").slice(0, 1000),
    cost_wood: clamp(p.cost_wood, 0, 15),
    cost_stone: clamp(p.cost_stone, 0, 15),
    cost_iron: clamp(p.cost_iron, 0, 10),
    cost_wealth: clamp(p.cost_wealth, 0, 30),
    build_duration: clamp(p.build_duration, 1, 4),
    effects: {
      food_income: clamp(e.food_income, 0, 4),
      wood_income: clamp(e.wood_income, 0, 4),
      stone_income: clamp(e.stone_income, 0, 3),
      iron_income: clamp(e.iron_income, 0, 3),
      wealth_income: clamp(e.wealth_income, 0, 5),
      stability_bonus: clamp(e.stability_bonus, 0, 10),
      influence_bonus: clamp(e.influence_bonus, 0, 10),
      population_growth: Math.max(0, Math.min(2, parseFloat(e.population_growth) || 0)),
      manpower_bonus: clamp(e.manpower_bonus, 0, 20),
      defense_bonus: clamp(e.defense_bonus, 0, 25),
    },
    image_prompt: (p.image_prompt || "").slice(0, 500),
    image_url: null as string | null,
  };
}
