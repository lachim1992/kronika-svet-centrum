/**
 * ai-lore-generate — Generates narrative lore content.
 * Uses createAIContext for premise + supplements with world_memories.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

const LORE_INSTRUCTIONS: Record<string, (ctx: any) => string> = {
  city_lore: (c) => `Vygeneruj bohatý popis a historii města "${c.cityName || ""}".
Biom: ${c.biome || "neznámý"}, Vlastník: ${c.owner || "neznámý"}.
${c.additionalInfo || ""}
Zahrň atmosféru, zvyky, architekturu a krátkou historii. 2-3 odstavce.`,
  artifact: (c) => `Vygeneruj legendární artefakt pro svět.
Název: ${c.artifactName || "vygeneruj"}
Místo: ${c.location || "neznámé"}
${c.additionalInfo || ""}
Zahrň původ, sílu, legendu a současný stav. 2-3 odstavce.`,
  region_summary: (c) => `Vytvoř geografický a kulturní souhrn regionu "${c.regionName || ""}".
Biom: ${c.biome || "neznámý"}.
${c.additionalInfo || ""}
Zahrň krajinu, obyvatele, obchodní cesty a zajímavosti. 2-3 odstavce.`,
  war_outcome: (c) => `Popiš výsledek vojenského konfliktu.
Útočník: ${c.attacker || "neznámý"}, Obránce: ${c.defender || "neznámý"}.
Místo: ${c.location || "neznámé"}.
${c.additionalInfo || ""}
Zahrň průběh bitvy, ztráty, následky pro region. 2-3 odstavce.`,
  faction_lore: (c) => `Vytvoř kulturní profil frakce "${c.factionName || ""}".
${c.additionalInfo || ""}
Zahrň tradice, víru, politický systém, zvyky a vztahy s okolím. 2-3 odstavce.`,
  custom: (c) => c._customPrompt || "Vygeneruj narativní text.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, loreType, context, customPrompt } = await req.json();

    if (!sessionId) return errorResponse("Missing sessionId", 400);

    const sb = getServiceClient();
    const ctx = await createAIContext(sessionId, undefined, sb);

    // Supplement: load approved world memories (specific facts premise doesn't have)
    const { data: memories } = await sb.from("world_memories")
      .select("text, category")
      .eq("session_id", sessionId)
      .eq("approved", true)
      .limit(15);

    const memoriesContext = (memories || []).length > 0
      ? `\nSCHVÁLENÁ FAKTA O SVĚTĚ (doplněk k premise):\n${memories!.map(m => `- [${m.category}] ${m.text}`).join("\n")}`
      : "";

    const instructionBuilder = LORE_INSTRUCTIONS[loreType] || LORE_INSTRUCTIONS.custom;
    const instruction = instructionBuilder({ ...context, _customPrompt: customPrompt });

    const result = await invokeAI(ctx, {
      systemPrompt: `Jsi kronikář a tvůrce lore pro fantasy svět. Piš česky, v narativním stylu odpovídajícím tónu světa. Tvým úkolem je vytvořit krátký, ale barvitý text, který hráč může použít ve svém příběhu.${memoriesContext}`,
      userPrompt: instruction,
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit" }, 429);
      return jsonResponse({ text: "Kronikář selhal...", debug: result.debug });
    }

    const text = result.data?.content || result.data || "Kronikář selhal...";
    return jsonResponse({ text: typeof text === "string" ? text : JSON.stringify(text), debug: result.debug });
  } catch (e) {
    console.error("ai-lore-generate error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
