/**
 * Extract Civ Identity — AI-powered extraction of structured civilization tags
 * from free-text civ_description.
 * 
 * Called during onboarding (ProvinceOnboardingWizard) and world generation.
 * Outputs: culture_tags, urban_style, society_structure, military_doctrine,
 *          economic_focus, and derived numeric modifiers.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, civDescription, coreMythText, culturalQuirkText, architecturalStyleText } = await req.json();

    if (!sessionId || !playerName) return errorResponse("Missing sessionId or playerName", 400);

    const sb = getServiceClient();

    // Gather all text sources
    let fullText = civDescription || "";
    if (coreMythText) fullText += `\nZakládající mýtus: ${coreMythText}`;
    if (culturalQuirkText) fullText += `\nKulturní zvláštnost: ${culturalQuirkText}`;
    if (architecturalStyleText) fullText += `\nArchitektonický styl: ${architecturalStyleText}`;

    if (!fullText.trim()) {
      // No text to analyze — insert defaults
      const { data } = await sb.from("civ_identity").upsert({
        session_id: sessionId,
        player_name: playerName,
        source_description: "",
      }, { onConflict: "session_id,player_name" }).select().single();

      return jsonResponse(data);
    }

    const ctx = await createAIContext(sessionId, undefined, sb, playerName);

    const result = await invokeAI(ctx, {
      model: "google/gemini-3-flash-preview",
      systemPrompt: `Jsi analytik herních civilizací. Na základě popisu civilizace extrahuj strukturované tagy.
Buď přesný — vycházej POUZE z textu, nevymýšlej. Pokud text neobsahuje relevantní informaci, použij výchozí hodnotu.

Výchozí hodnoty:
- urban_style: "organic" (alternativy: planned, fortified, scattered, coastal, underground)
- society_structure: "tribal" (alternativy: hierarchical, egalitarian, theocratic, feudal, mercantile)
- military_doctrine: "defensive" (alternativy: offensive, guerrilla, naval, mercenary, conscript)
- economic_focus: "agrarian" (alternativy: trade, mining, crafting, raiding, mixed)

Pro culture_tags vyber 3–6 výstižných slov (anglicky): discipline, agriculture, stone_architecture, logistics, seafaring, cavalry, mysticism, iron_working, diplomacy, artisan, nomadic, scholarly, warrior_culture, engineering, maritime_trade atd.

Pro modifikátory:
- grain_modifier: -0.1 až +0.2 (agriculture/fertility → kladné, raiding/nomadic → záporné)
- production_modifier: -0.1 až +0.2 (crafting/engineering → kladné)
- trade_modifier: -0.1 až +0.2 (trade/maritime → kladné)
- stability_modifier: -10 až +10 (discipline/tradition → kladné, nomadic/raiding → záporné)
- morale_modifier: -5 až +10 (warrior_culture → kladné)
- mobilization_speed: 0.5 až 1.5 (conscript/warrior → vyšší, peaceful → nižší)`,
      userPrompt: `Analyzuj tento popis civilizace a extrahuj strukturované tagy:\n\n"${fullText}"`,
      tools: [{
        type: "function",
        function: {
          name: "extract_identity",
          description: "Extract structured civilization identity tags",
          parameters: {
            type: "object",
            properties: {
              culture_tags: {
                type: "array",
                items: { type: "string" },
                description: "3-6 English keyword tags describing the culture",
              },
              urban_style: {
                type: "string",
                enum: ["organic", "planned", "fortified", "scattered", "coastal", "underground"],
              },
              society_structure: {
                type: "string",
                enum: ["tribal", "hierarchical", "egalitarian", "theocratic", "feudal", "mercantile"],
              },
              military_doctrine: {
                type: "string",
                enum: ["defensive", "offensive", "guerrilla", "naval", "mercenary", "conscript"],
              },
              economic_focus: {
                type: "string",
                enum: ["agrarian", "trade", "mining", "crafting", "raiding", "mixed"],
              },
              grain_modifier: { type: "number" },
              production_modifier: { type: "number" },
              trade_modifier: { type: "number" },
              stability_modifier: { type: "number" },
              morale_modifier: { type: "number" },
              mobilization_speed: { type: "number" },
            },
            required: ["culture_tags", "urban_style", "society_structure", "military_doctrine", "economic_focus",
                       "grain_modifier", "production_modifier", "trade_modifier", "stability_modifier", "morale_modifier", "mobilization_speed"],
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "extract_identity" } },
    });

    if (!result.ok) {
      console.error("AI extraction failed:", result.error);
      // Fallback: insert defaults
      const { data } = await sb.from("civ_identity").upsert({
        session_id: sessionId,
        player_name: playerName,
        source_description: fullText,
      }, { onConflict: "session_id,player_name" }).select().single();
      return jsonResponse({ ...data, ai_error: result.error });
    }

    const extracted = result.data;

    // Clamp modifiers to safe ranges
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v || 0));

    const row = {
      session_id: sessionId,
      player_name: playerName,
      culture_tags: extracted.culture_tags || [],
      urban_style: extracted.urban_style || "organic",
      society_structure: extracted.society_structure || "tribal",
      military_doctrine: extracted.military_doctrine || "defensive",
      economic_focus: extracted.economic_focus || "agrarian",
      grain_modifier: clamp(extracted.grain_modifier, -0.1, 0.2),
      production_modifier: clamp(extracted.production_modifier, -0.1, 0.2),
      trade_modifier: clamp(extracted.trade_modifier, -0.1, 0.2),
      stability_modifier: clamp(extracted.stability_modifier, -10, 10),
      morale_modifier: clamp(extracted.morale_modifier, -5, 10),
      mobilization_speed: clamp(extracted.mobilization_speed, 0.5, 1.5),
      source_description: fullText,
      extraction_model: "gemini-3-flash-preview",
      extracted_at: new Date().toISOString(),
    };

    const { data, error } = await sb
      .from("civ_identity")
      .upsert(row, { onConflict: "session_id,player_name" })
      .select()
      .single();

    if (error) {
      console.error("DB insert error:", error);
      return errorResponse("Failed to save identity: " + error.message);
    }

    return jsonResponse(data);
  } catch (e) {
    console.error("extract-civ-identity error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
