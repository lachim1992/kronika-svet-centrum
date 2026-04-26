/**
 * Extract Civ Identity — AI-powered extraction of structured civilization tags
 * from free-text civ_description.
 * 
 * UNIFIED faction system: single source of truth for all civ modifiers.
 * Called during onboarding (WorldSetupWizard) and later editing.
 * Outputs: culture_tags, display_name, flavor_summary, all mechanical modifiers.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      sessionId,
      playerName,
      civDescription,
      // Optional alias used by the wizard pre-creation preview flow.
      description,
      coreMythText,
      culturalQuirkText,
      architecturalStyleText,
      // Optional extra context (used by wizard preview to enrich AI extraction).
      context,
    } = body;

    // PREVIEW MODE: when sessionId/playerName missing, we just extract and
    // return the result WITHOUT persisting anything. Used by WorldSetupWizard
    // before the session exists. Caller is then expected to ship the data
    // along with the bootstrap request (identityModifiers payload).
    const isPreviewMode = !sessionId || !playerName;

    const sb = getServiceClient();

    // Gather all text sources
    let fullText = (civDescription || description || "").toString();
    if (coreMythText) fullText += `\nZakládající mýtus: ${coreMythText}`;
    if (culturalQuirkText) fullText += `\nKulturní zvláštnost: ${culturalQuirkText}`;
    if (architecturalStyleText) fullText += `\nArchitektonický styl: ${architecturalStyleText}`;
    if (context && typeof context === "object") {
      const parts: string[] = [];
      if (context.premise) parts.push(`Premisa světa: ${context.premise}`);
      if (context.realm_name) parts.push(`Říše: ${context.realm_name}`);
      if (context.ruler_name) parts.push(`Vládce: ${context.ruler_title || ""} ${context.ruler_name}`.trim());
      if (context.ruler_archetype) parts.push(`Archetyp vládce: ${context.ruler_archetype}`);
      if (context.ruler_bio) parts.push(`Životopis vládce: ${context.ruler_bio}`);
      if (context.government_form) parts.push(`Forma vlády: ${context.government_form}`);
      if (context.dominant_faith) parts.push(`Dominantní víra: ${context.dominant_faith}`);
      if (context.culture_name) parts.push(`Kultura: ${context.culture_name}`);
      if (context.homeland_desc) parts.push(`Domovina: ${context.homeland_desc}`);
      if (context.founding_legend) parts.push(`Zakládající legenda: ${context.founding_legend}`);
      if (parts.length > 0) fullText += "\n" + parts.join("\n");
    }

    if (!fullText.trim()) {
      if (isPreviewMode) {
        return errorResponse("Missing description for preview extraction", 400);
      }
      const { data } = await sb.from("civ_identity").upsert({
        session_id: sessionId,
        player_name: playerName,
        source_description: "",
      }, { onConflict: "session_id,player_name" }).select().single();

      return jsonResponse(data);
    }

    const ctx = isPreviewMode
      ? { sessionId: null, supabase: sb } as any
      : await createAIContext(sessionId, undefined, sb, playerName);

    const result = await invokeAI(ctx, {
      model: "google/gemini-3-flash-preview",
      systemPrompt: `Jsi herní designér strategické hry. Na základě popisu civilizace od hráče vygeneruj kompletní sadu mechanických modifikátorů.

PRAVIDLA:
- Vycházej STRIKTNĚ z textu hráče. Nevymýšlej informace, které text neobsahuje.
- Modifikátory musí být vyvážené: silný bonus v jedné oblasti = malus v jiné.
- Součet všech produkčních modifikátorů (grain + wood + stone + iron + wealth) nesmí přesáhnout +0.3.
- Každá civilizace musí mít alespoň jednu slabinu.

KATEGORIE MODIFIKÁTORŮ:

1. PRODUKCE (multiplikativní, aplikované na základní produkci měst):
- grain_modifier: -0.15 až +0.25 (zemědělství, fertilita → kladné; nájezdníci, nomádi → záporné)
- wood_modifier: -0.15 až +0.25 (lesní národy → kladné; pouštní → záporné)  
- stone_modifier: -0.15 až +0.25 (horští, stavitelé → kladné; nomádi → záporné)
- iron_modifier: -0.15 až +0.25 (kovářství → kladné; primitivní → záporné)
- wealth_modifier: -0.15 až +0.25 (obchodníci → kladné; izolacionisté → záporné)

2. POPULACE:
- pop_growth_modifier: -0.01 až +0.02 (plodní, usedlí → kladné; válečníci, asketi → záporné)
- initial_burgher_ratio: -0.15 až +0.20 (obchodní → kladné; rurální → záporné). Určuje odchylku od základního šablonového rozložení populace.
- initial_cleric_ratio: -0.10 až +0.15 (teokratičtí → kladné; pragmatici → záporné)

3. VOJENSTVÍ:
- morale_modifier: -5 až +10 (válečnická kultura → kladné; pacifisté → záporné)
- mobilization_speed: 0.5 až 1.5 (1.0 = normální; branná povinnost → vyšší; mírumilovní → nižší)
- cavalry_bonus: 0 až 0.3 (jezdecké národy → vyšší; ostrované → 0)
- fortification_bonus: 0 až 0.25 (stavitelé hradeb → vyšší; nomádi → 0)

4. STABILITA & DIPLOMACIE:
- stability_modifier: -10 až +10 (tradice, řád → kladné; anarchistické → záporné)
- trade_modifier: -0.1 až +0.2 (obchod → kladné; izolace → záporné)
- diplomacy_modifier: -10 až +15 (diplomaté, vyjednávači → kladné; barbaři, izolovaní → záporné). Přidáno k diplomatickému skóre vlivu a ovlivňuje úspěšnost vyjednávání.
- research_modifier: -0.1 až +0.2 (učenci, knihovníci → kladné; primitivní, válečníci → záporné). Bonus k efektivitě budov generujících výzkum a rychlosti vylepšování staveb.

5. KULTURNÍ TAGY:
- culture_tags: 3-6 anglických klíčových slov (discipline, agriculture, seafaring, cavalry, mysticism, iron_working, diplomacy, artisan, nomadic, scholarly, warrior_culture, engineering, maritime_trade, horse_lords, mountain_folk, forest_dwellers, desert_nomads, river_culture)

6. STRUKTURÁLNÍ KATEGORIE:
- urban_style: organic|planned|fortified|scattered|coastal|underground
- society_structure: tribal|hierarchical|egalitarian|theocratic|feudal|mercantile
- military_doctrine: defensive|offensive|guerrilla|naval|mercenary|conscript
- economic_focus: agrarian|trade|mining|crafting|raiding|mixed

7. IDENTITA:
- display_name: Krátký název frakce (max 30 znaků, např. "Děti Železné hory")
- flavor_summary: Jednořádkový popis frakce v epickém stylu (max 100 znaků)

8. SPECIÁLNÍ BUDOVY:
- building_tags: 0-3 speciální typy budov dostupné pouze této civilizaci (anglicky, snake_case, např. horse_stable, sacred_grove, sea_port, iron_forge, trade_depot)

9. VOJENSKÉ JEDNOTKY (dva typy — MILICE a PROFESIONÁLOVÉ):
- militia_unit_name: Krátký český název pro základní jednotku milice (3-4 slova, vychází z kultury civilizace, např. "Rybí kopíníci", "Lesní zálesáci", "Pouštní šíponoši")
- militia_unit_desc: Jednořádkový popis milice (max 80 znaků, český jazyk)
- professional_unit_name: Krátký český název pro elitní profesionální jednotku (3-4 slova, vychází z kultury civilizace, např. "Stínové legie", "Železní gardisté", "Chrámová stráž")
- professional_unit_desc: Jednořádkový popis profesionálů (max 80 znaků, český jazyk)

10. NARATIVNÍ FLAVOR (vše česky):
- core_myth: Zakládající mýtus civilizace (1-2 věty, epický styl)
- cultural_quirk: Unikátní kulturní zvláštnost (1 věta)
- architectural_style: Architektonický styl (1-2 slova)`,
      userPrompt: `Analyzuj tento popis civilizace a extrahuj kompletní sadu modifikátorů:\n\n"${fullText}"`,
      tools: [{
        type: "function",
        function: {
          name: "extract_identity",
          description: "Extract complete civilization identity with all mechanical modifiers",
          parameters: {
            type: "object",
            properties: {
              display_name: { type: "string", description: "Short faction display name" },
              flavor_summary: { type: "string", description: "One-line epic flavor summary" },
              culture_tags: {
                type: "array",
                items: { type: "string" },
                description: "3-6 English keyword tags",
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
              // Production modifiers
              grain_modifier: { type: "number" },
              wood_modifier: { type: "number" },
              stone_modifier: { type: "number" },
              iron_modifier: { type: "number" },
              wealth_modifier: { type: "number" },
              // Population
              pop_growth_modifier: { type: "number" },
              initial_burgher_ratio: { type: "number" },
              initial_cleric_ratio: { type: "number" },
              // Military
              morale_modifier: { type: "number" },
              mobilization_speed: { type: "number" },
              cavalry_bonus: { type: "number" },
              fortification_bonus: { type: "number" },
              // Stability & Diplomacy
              stability_modifier: { type: "number" },
              trade_modifier: { type: "number" },
              diplomacy_modifier: { type: "number" },
              research_modifier: { type: "number" },
              // Buildings
              building_tags: {
                type: "array",
                items: { type: "string" },
                description: "0-3 special building type tags",
              },
              // Narrative flavor
              core_myth: { type: "string", description: "Founding myth in Czech (1-2 sentences)" },
              cultural_quirk: { type: "string", description: "Unique cultural quirk in Czech (1 sentence)" },
              architectural_style: { type: "string", description: "Architectural style in Czech (1-2 words)" },
              // Military unit names
              militia_unit_name: { type: "string", description: "Czech name for militia unit (3-4 words)" },
              militia_unit_desc: { type: "string", description: "One-line militia description in Czech (max 80 chars)" },
              professional_unit_name: { type: "string", description: "Czech name for professional unit (3-4 words)" },
              professional_unit_desc: { type: "string", description: "One-line professional description in Czech (max 80 chars)" },
            },
            required: [
              "display_name", "flavor_summary", "culture_tags",
              "urban_style", "society_structure", "military_doctrine", "economic_focus",
              "grain_modifier", "wood_modifier", "stone_modifier", "iron_modifier", "wealth_modifier",
              "pop_growth_modifier", "initial_burgher_ratio", "initial_cleric_ratio",
              "morale_modifier", "mobilization_speed", "cavalry_bonus", "fortification_bonus",
              "stability_modifier", "trade_modifier", "diplomacy_modifier", "research_modifier",
              "building_tags",
              "core_myth", "cultural_quirk", "architectural_style",
              "militia_unit_name", "militia_unit_desc", "professional_unit_name", "professional_unit_desc",
            ],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "extract_identity" } },
    });

    if (!result.ok) {
      console.error("AI extraction failed:", result.error);
      if (isPreviewMode) {
        return errorResponse("AI extraction failed: " + (result.error || "unknown"));
      }
      const { data } = await sb.from("civ_identity").upsert({
        session_id: sessionId,
        player_name: playerName,
        source_description: fullText,
      }, { onConflict: "session_id,player_name" }).select().single();
      return jsonResponse({ ...data, ai_error: result.error });
    }

    const ex = result.data;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v || 0));

    // Enforce balance: total production bonus cap
    let prodSum = (ex.grain_modifier || 0) + (ex.wood_modifier || 0) + (ex.stone_modifier || 0) + (ex.iron_modifier || 0) + (ex.wealth_modifier || 0);
    const prodScale = prodSum > 0.3 ? 0.3 / prodSum : 1;

    const row: Record<string, any> = {
      display_name: (ex.display_name || "").slice(0, 30) || null,
      flavor_summary: (ex.flavor_summary || "").slice(0, 100) || null,
      culture_tags: ex.culture_tags || [],
      urban_style: ex.urban_style || "organic",
      society_structure: ex.society_structure || "tribal",
      military_doctrine: ex.military_doctrine || "defensive",
      economic_focus: ex.economic_focus || "agrarian",
      // Production (scaled if over cap)
      grain_modifier: clamp((ex.grain_modifier || 0) * prodScale, -0.15, 0.25),
      wood_modifier: clamp((ex.wood_modifier || 0) * prodScale, -0.15, 0.25),
      stone_modifier: clamp((ex.stone_modifier || 0) * prodScale, -0.15, 0.25),
      iron_modifier: clamp((ex.iron_modifier || 0) * prodScale, -0.15, 0.25),
      wealth_modifier: clamp((ex.wealth_modifier || 0) * prodScale, -0.15, 0.25),
      // Population
      pop_growth_modifier: clamp(ex.pop_growth_modifier, -0.01, 0.02),
      initial_burgher_ratio: clamp(ex.initial_burgher_ratio, -0.15, 0.20),
      initial_cleric_ratio: clamp(ex.initial_cleric_ratio, -0.10, 0.15),
      production_modifier: clamp(((ex.wood_modifier || 0) + (ex.stone_modifier || 0)) / 2, -0.15, 0.25),
      // Military
      morale_modifier: clamp(ex.morale_modifier, -5, 10),
      mobilization_speed: clamp(ex.mobilization_speed, 0.5, 1.5),
      cavalry_bonus: clamp(ex.cavalry_bonus, 0, 0.3),
      fortification_bonus: clamp(ex.fortification_bonus, 0, 0.25),
      // Stability
      stability_modifier: clamp(ex.stability_modifier, -10, 10),
      trade_modifier: clamp(ex.trade_modifier, -0.1, 0.2),
      diplomacy_modifier: clamp(ex.diplomacy_modifier, -10, 15),
      research_modifier: clamp(ex.research_modifier, -0.1, 0.2),
      // Buildings
      building_tags: (ex.building_tags || []).slice(0, 3),
      // Military unit names
      militia_unit_name: (ex.militia_unit_name || "Milice").slice(0, 60),
      militia_unit_desc: (ex.militia_unit_desc || "").slice(0, 120),
      professional_unit_name: (ex.professional_unit_name || "Profesionálové").slice(0, 60),
      professional_unit_desc: (ex.professional_unit_desc || "").slice(0, 120),
      // Narrative flavor (kept on response so caller can persist into civilizations later)
      core_myth: (ex.core_myth || "").slice(0, 500) || null,
      cultural_quirk: (ex.cultural_quirk || "").slice(0, 300) || null,
      architectural_style: (ex.architectural_style || "").slice(0, 100) || null,
      // Meta
      source_description: fullText,
      extraction_model: "gemini-3-flash-preview",
      extracted_at: new Date().toISOString(),
    };

    if (isPreviewMode) {
      // Return extraction without persisting. Caller (wizard) ships this to
      // the bootstrap orchestrator as identityModifiers.
      return jsonResponse({ ...row, _preview: true });
    }

    const persistRow = { ...row, session_id: sessionId, player_name: playerName };
    // Strip narrative-only fields not in civ_identity table
    delete persistRow.core_myth;
    delete persistRow.cultural_quirk;
    delete persistRow.architectural_style;

    const { data, error } = await sb
      .from("civ_identity")
      .upsert(persistRow, { onConflict: "session_id,player_name" })
      .select()
      .single();

    if (error) {
      console.error("DB insert error:", error);
      return errorResponse("Failed to save identity: " + error.message);
    }

    // Sync display_name + narrative flavor to civilizations table
    const civUpdate: Record<string, any> = {};
    if (row.display_name) civUpdate.civ_name = row.display_name;
    if (row.core_myth) civUpdate.core_myth = row.core_myth;
    if (row.cultural_quirk) civUpdate.cultural_quirk = row.cultural_quirk;
    if (row.architectural_style) civUpdate.architectural_style = row.architectural_style;
    if (Object.keys(civUpdate).length > 0) {
      await sb.from("civilizations").update(civUpdate)
        .eq("session_id", sessionId).eq("player_name", playerName);
    }

    // Auto-generate premium civ buildings if building_tags exist
    if (row.building_tags.length > 0) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(`${supabaseUrl}/functions/v1/generate-civ-buildings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ sessionId, playerName }),
        });
      } catch (e) {
        console.error("Auto-generate civ buildings failed (non-blocking):", e);
      }
    }

    return jsonResponse(data);
  } catch (e) {
    console.error("extract-civ-identity error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
