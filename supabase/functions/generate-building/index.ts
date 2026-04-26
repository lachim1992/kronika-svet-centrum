/**
 * generate-building — Generates a building with 5-level upgrade system.
 *
 * Text generation migrated to unified AI pipeline so the building's name,
 * description, founding_myth and level_data cite both:
 *   - P0 (World Premise — Pradávno + Současnost + Zlom + Pradávné rody)
 *   - P0b (Player Premise — civilization identity, claimed lineages,
 *          architectural style)
 *
 * Image generation continues to use the dedicated image model directly
 * (gemini-2.5-flash-image), but the prompt is enriched with lineage
 * cultural anchors and architectural style.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  createAIContext,
  invokeAI,
  jsonResponse,
  errorResponse,
} from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, cityId, playerDescription, buildingMyth, visualDescription, cityName, cityLevel, biome, buildSpeedModifier: explicitMod } = await req.json();

    if (!sessionId || !cityId || !playerDescription) {
      return errorResponse("Missing required fields", 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    let buildSpeedModifier = explicitMod || 0;
    let ownerPlayer: string | null = null;

    const { data: city } = await sb.from("cities").select("owner_player").eq("id", cityId).maybeSingle();
    if (city?.owner_player) {
      ownerPlayer = city.owner_player;
      const { data: civ } = await sb.from("civilizations")
        .select("civ_bonuses")
        .eq("session_id", sessionId).eq("player_name", city.owner_player).maybeSingle();
      if (civ) {
        const bonuses = (civ.civ_bonuses as Record<string, number>) || {};
        if (!explicitMod && bonuses.build_speed_modifier) buildSpeedModifier = bonuses.build_speed_modifier;
      }
    }

    if (!LOVABLE_API_KEY) {
      return jsonResponse(getDefaultBuilding(playerDescription));
    }

    // Build unified context with player premise (P0b) loaded from DB.
    const ctx = await createAIContext(sessionId, undefined, sb, ownerPlayer ?? undefined);
    const cc = ctx.civContext;

    const systemPrompt = `Jsi designér středověkých budov pro civilizační strategickou hru.
Na základě hráčova konceptu vygeneruj budovu s 5 úrovněmi vylepšení.

PRAVIDLA:
- category MUSÍ být jeden z: economic, military, cultural, religious, infrastructure
- Level 1 = základní budova. Každá další úroveň přidá +50-100% efektů A odemkne NOVÝ bonus.
- Level 5 = TRANSFORMACE NA DIV SVĚTA — masivní bonusy + globální vliv.
- Effects keys: grain_production, iron_production, wood_production, stone_production, wealth, stability, influence, defense, recruitment, military_quality, military_garrison, morale_bonus, trade_bonus, granary_capacity, population_capacity, legitimacy, cleric_attraction, burgher_attraction, disease_resistance, siege_power, siege_resistance, cavalry_bonus, ranged_bonus, mobility, vision, espionage_defense, special_production, naval_power, research
- Náklady: Lvl2=2x, Lvl3=4x, Lvl4=8x, Lvl5=16x z base
- Veškerý text ČESKY
- Názvy úrovní se vyvíjí (např. Kovárna → Zbrojnice → Arsenal → Královská zbrojírna → Legenda Oceli)
- Level 5 jméno musí znít legendárně/mýticky
- founding_myth a description MUSÍ doslova citovat hráčovu premisu národa (P0b) a navazovat na premisu světa (P0 — Pradávné rody, Zlom, Současnost). Pokud má národ adoptované Pradávné rody, MUSÍŠ je v mýtu zmínit jménem.

Odpověz POUZE validním JSON.`;

    const userPrompt = `Hráčův koncept budovy: "${playerDescription}"
${buildingMyth ? `Hráčův zakládací mýtus (KRITICKÉ — MUSÍŠ ho věrně přepsat do epického stylu, zachovat VŠECHNY klíčové prvky, postavy a motivace): "${buildingMyth}"` : ""}
${visualDescription ? `Vizuál: "${visualDescription}"` : ""}
Město: "${cityName || "Sídlo"}" (úroveň: ${cityLevel || "HAMLET"})
Biom: "${biome || "pláně"}"

Vygeneruj budovu jako JSON s 5-úrovňovým systémem:
{
  "name": "<český název pro level 1>",
  "category": "<economic|military|cultural|religious|infrastructure>",
  "description": "<1-2 věty česky>",
  "flavor_text": "<1 atmosférická věta česky>",
  "founding_myth": "<KRITICKÉ: pokud hráč zadal mýtus výše, MUSÍŠ ho věrně přepsat do epického stylu (2-4 věty česky). Zachovej hráčovy postavy a smysl. Pokud mýtus nebyl zadán, vytvoř krátkou origin legendu inspirovanou konceptem A pradávným dědictvím národa.>",
  "cost_wood": <int 0-15>,
  "cost_stone": <int 0-15>,
  "cost_iron": <int 0-10>,
  "cost_wealth": <int 0-30>,
  "build_duration": <int 1-4>,
  "effects": { <level 1 efekty, mírné hodnoty> },
  "level_data": [
    {"level": 1, "name": "<česky>", "effects": {<jako base>}, "cost_mult": 1, "unlock": "<co Lvl1 dává>"},
    {"level": 2, "name": "<česky>", "effects": {<+50-80% z lvl1>}, "cost_mult": 2, "unlock": "<nový bonus>"},
    {"level": 3, "name": "<česky>", "effects": {<+100% z lvl1 + nový efekt>}, "cost_mult": 4, "unlock": "<nový bonus>"},
    {"level": 4, "name": "<česky>", "effects": {<+200% z lvl1 + 2 nové efekty>}, "cost_mult": 8, "unlock": "<silný nový bonus>"},
    {"level": 5, "name": "<LEGENDÁRNÍ česky název>", "effects": {<masivní + global_influence + diplomatic_prestige>}, "cost_mult": 16, "unlock": "<Div světa: popis legendárního bonusu>"}
  ],
  "image_prompt": "<anglický prompt pro středověkou ilustraci, MUSÍ obsahovat odkaz na architectural_style národa A na adoptované Pradávné rody>"
}`;

    const aiResult = await invokeAI(ctx, {
      model: "google/gemini-2.5-flash",
      systemPrompt,
      userPrompt,
      maxTokens: 2500,
      functionName: "generate-building",
    });

    if (!aiResult.ok || !aiResult.data) {
      console.warn("[generate-building] AI failed, returning defaults:", aiResult.error);
      return jsonResponse(getDefaultBuilding(playerDescription));
    }

    const result = validateBuilding(aiResult.data);

    if (buildSpeedModifier && buildSpeedModifier !== 0) {
      result.build_duration = Math.max(1, Math.round(result.build_duration * (1 + buildSpeedModifier)));
    }

    // ── Image generation — enriched with civContext (architecturalStyle, lineages) ──
    const lineageAnchors = (cc?.claimedLineages ?? [])
      .map((l) => l.culturalAnchor || l.name)
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");
    const parts: string[] = [];
    parts.push(`Medieval fantasy building illustration of "${result.name}".`);
    if (cc?.architecturalStyle) parts.push(`Architecture style of nation ${cc.civName ?? ""}: ${cc.architecturalStyle}.`);
    if (lineageAnchors) parts.push(`Visible heritage of ancient lineages (${lineageAnchors}) — incorporate motifs.`);
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

    return jsonResponse({ ...result, debug: aiResult.debug });
  } catch (e) {
    console.error("generate-building error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
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
