/**
 * Generate Civilization-Specific Premium Buildings
 * 
 * Creates 2 unique premium buildings based on civ_identity building_tags.
 * These have stronger effects (1.5-2x normal), higher costs, and 5-level upgrade paths.
 * Stored in civ_identity.special_buildings JSON for player to build in any city.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName } = await req.json();
    if (!sessionId || !playerName) return errorResponse("Missing sessionId or playerName", 400);

    const sb = getServiceClient();

    // Load civ_identity
    const { data: identity } = await sb.from("civ_identity")
      .select("building_tags, display_name, flavor_summary, culture_tags, military_doctrine, economic_focus, society_structure, urban_style, special_buildings")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();

    if (!identity || !identity.building_tags?.length) {
      return jsonResponse({ ok: true, buildings: [], message: "No building tags" });
    }

    // Skip if already generated
    if (identity.special_buildings && (identity.special_buildings as any[]).length > 0) {
      return jsonResponse({ ok: true, buildings: identity.special_buildings, message: "Already generated" });
    }

    // Load civ narrative context
    const { data: civ } = await sb.from("civilizations")
      .select("core_myth, cultural_quirk, architectural_style")
      .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();

    const tags = identity.building_tags.slice(0, 3);
    const civContext = [
      identity.display_name ? `Civilizace: ${identity.display_name}` : "",
      identity.flavor_summary ? `Motto: ${identity.flavor_summary}` : "",
      identity.culture_tags?.length ? `Kulturní tagy: ${identity.culture_tags.join(", ")}` : "",
      identity.military_doctrine ? `Vojenská doktrína: ${identity.military_doctrine}` : "",
      identity.economic_focus ? `Ekonomické zaměření: ${identity.economic_focus}` : "",
      identity.society_structure ? `Společenská struktura: ${identity.society_structure}` : "",
      civ?.core_myth ? `Zakládající mýtus: ${civ.core_myth}` : "",
      civ?.cultural_quirk ? `Kulturní zvláštnost: ${civ.cultural_quirk}` : "",
      civ?.architectural_style ? `Architektonický styl: ${civ.architectural_style}` : "",
    ].filter(Boolean).join("\n");

    const ctx = await createAIContext(sessionId, undefined, sb, playerName);

    const result = await invokeAI(ctx, {
      model: "google/gemini-3-flash-preview",
      systemPrompt: `Jsi herní designér prémiových civilizačních budov pro strategickou hru. Na základě building_tags a KOMPLETNÍHO kontextu civilizace vygeneruj ${tags.length >= 2 ? 2 : 1} unikátní prémiové budovy.

KRITICKÉ PRAVIDLO KOHERENCE:
- Budovy MUSÍ logicky vycházet z podstaty civilizace — jejího mýtu, kultury, společnosti a ekonomiky.
- Pokud je civilizace říční rybářský kmen s mystickými tradicemi, budovy musí odrážet řeku, ryby, mystiku — NE generické „kovárny" nebo „akademie".
- Název, popis, founding_myth i efekty musí být narativně propojené s civilizační identitou.
- Founding_myth MUSÍ navazovat na core_myth civilizace — příběh budovy je pokračováním příběhu kmene.

PRAVIDLA PRÉMIOVÝCH BUDOV:
- Budovy jsou EXKLUZIVNÍ pro tuto civilizaci — nikdo jiný je nemůže stavět
- Efekty jsou VÝRAZNĚ silnější než normální budovy (1.5-2x)
- Náklady jsou VYŠŠÍ (prémiové): wood 12-20, stone 10-18, iron 8-15, wealth 20-40
- Doba stavby: 3-5 kol (delší než normální)
- Každá budova má 5 úrovní vylepšení
- Level 5 = quasi-Div světa s globálními bonusy
- Názvy a popisy v ČEŠTINĚ

EFEKTY (klíče): grain_production, iron_production, wood_production, stone_production, wealth, stability, influence, defense, recruitment, military_quality, military_garrison, morale_bonus, trade_bonus, granary_capacity, population_capacity, legitimacy, cleric_attraction, burgher_attraction, disease_resistance, siege_power, siege_resistance, cavalry_bonus, ranged_bonus, mobility, vision, espionage_defense, special_production, naval_power, research

PŘÍKLADY silných efektů pro Level 1:
- fishing_wharf: { grain_production: 8, trade_bonus: 5, naval_power: 3, wealth: 3 }
- sacred_grove: { stability: 12, legitimacy: 8, cleric_attraction: 5, morale_bonus: 3 }
- iron_forge: { iron_production: 6, military_quality: 8, siege_power: 5 }`,
      userPrompt: `Building tags: ${tags.join(", ")}

Kontext civilizace:
${civContext}

DŮLEŽITÉ: Budovy musí přímo odrážet identitu tohoto konkrétního kmene/národa — ne generické budovy. Každá budova by měla vyprávět příběh, který navazuje na mýtus a kulturu civilizace.

Vygeneruj ${tags.length >= 2 ? 2 : 1} prémiových budov.`,
      tools: [{
        type: "function",
        function: {
          name: "generate_buildings",
          description: "Generate premium civilization buildings",
          parameters: {
            type: "object",
            properties: {
              buildings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tag: { type: "string", description: "Original building_tag this building is based on" },
                    name: { type: "string", description: "Czech name for level 1" },
                    category: { type: "string", enum: ["economic", "military", "cultural", "religious", "infrastructure"] },
                    description: { type: "string", description: "1-2 sentences Czech" },
                    flavor_text: { type: "string", description: "1 atmospheric sentence Czech" },
                    founding_myth: { type: "string", description: "Short origin legend, 2-3 sentences Czech" },
                    cost_wood: { type: "number" },
                    cost_stone: { type: "number" },
                    cost_iron: { type: "number" },
                    cost_wealth: { type: "number" },
                    build_duration: { type: "number", description: "3-5 turns" },
                    effects: { type: "object", description: "Level 1 effects with strong values" },
                    level_data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          level: { type: "number" },
                          name: { type: "string" },
                          effects: { type: "object" },
                          cost_mult: { type: "number" },
                          unlock: { type: "string" },
                        },
                        required: ["level", "name", "effects", "cost_mult", "unlock"],
                      },
                    },
                    image_prompt: { type: "string", description: "English prompt for medieval illustration" },
                  },
                  required: ["tag", "name", "category", "description", "flavor_text", "founding_myth", "cost_wood", "cost_stone", "cost_iron", "cost_wealth", "build_duration", "effects", "level_data", "image_prompt"],
                },
              },
            },
            required: ["buildings"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "generate_buildings" } },
    });

    if (!result.ok) {
      console.error("AI generation failed:", result.error);
      return jsonResponse({ ok: false, error: result.error });
    }

    const buildings = (result.data?.buildings || []).map((b: any) => ({
      ...b,
      is_premium: true,
      is_civ_exclusive: true,
      cost_wood: Math.max(12, b.cost_wood || 15),
      cost_stone: Math.max(10, b.cost_stone || 12),
      cost_iron: Math.max(8, b.cost_iron || 10),
      cost_wealth: Math.max(20, b.cost_wealth || 25),
      build_duration: Math.max(3, Math.min(5, b.build_duration || 4)),
      max_level: 5,
    }));

    // Save to civ_identity
    await sb.from("civ_identity").update({
      special_buildings: buildings,
    }).eq("session_id", sessionId).eq("player_name", playerName);

    return jsonResponse({ ok: true, buildings });
  } catch (e) {
    console.error("generate-civ-buildings error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
