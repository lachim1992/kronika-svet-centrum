import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      sessionId, events, worldMemories, fromTurn, toTurn, existingWorldEvents,
      battles, declarations, completedBuildings, rumors,
    } = await req.json();

    if (!sessionId) return errorResponse("Missing sessionId", 400);

    const ctx = await createAIContext(sessionId, toTurn);

    // Check if history generation is enabled
    const historyEnabled = ctx.premise.narrativeRules?.history?.enabled !== false;
    if (!historyEnabled) {
      return jsonResponse({
        chapterTitle: `Dějiny světa (roky ${fromTurn}–${toTurn})`,
        chapterText: "Generování historických syntéz je vypnuto v narativní konfiguraci.",
        eventsMentioned: [],
      });
    }

    const includeMetrics = ctx.premise.narrativeRules?.history?.include_metrics !== false;

    // ── Serialize data ──
    const eventsText = (events || []).map((e: any) =>
      `[Rok ${e.turn_number}] ${e.player}: ${e.event_type}${e.location ? ` u ${e.location}` : ""}${e.note ? ` — ${e.note}` : ""}${e.result ? ` → ${e.result}` : ""}${e.importance === "major" ? " [DŮLEŽITÉ]" : ""}${e.treaty_type ? ` [Smlouva: ${e.treaty_type}]` : ""}${e.terms_summary ? ` Podmínky: ${e.terms_summary}` : ""}`
    ).join("\n");

    const memoriesText = (worldMemories || []).map((m: any) =>
      typeof m === "string" ? m : `- ${m}`
    ).join("\n");

    const battlesText = (battles || []).map((b: any) =>
      `BITVA rok ${b.turn_number}: síla ${b.attacker_strength_snapshot} vs ${b.defender_strength_snapshot}, výsledek: ${b.result}, ztráty: ${b.casualties_attacker}/${b.casualties_defender}, terén: ${b.biome || "neznámý"}`
    ).join("\n");

    const declarationsText = (declarations || []).map((d: any) =>
      `PROHLÁŠENÍ rok ${d.turn_number} [${d.declaration_type}] ${d.player_name}: ${d.epic_text || d.original_text}`
    ).join("\n");

    const buildingsText = (completedBuildings || []).map((b: any) =>
      `STAVBA dokončena: "${b.name}" [${b.category}]${b.founding_myth ? ` — Mýtus: ${b.founding_myth}` : ""}`
    ).join("\n");

    const rumorsText = (rumors || []).map((r: any) =>
      `ZVĚST rok ${r.turn_number} z ${r.city_name}: ${r.text}`
    ).join("\n");

    const existingEventsText = (existingWorldEvents || []).map((e: any) =>
      `- id="${e.id}" title="${e.title}"${e.summary ? ` summary="${e.summary}"` : ""}`
    ).join("\n");

    const systemPrompt = `Jsi nestranný historik světa.

PRAVIDLA:
- Piš NEUTRÁLNĚ, jako historik celého světa, nikoli z perspektivy jednoho hráče.
- Bitvy analyzuj objektivně — uveď síly, výsledek a důsledky.
- Prohlášení a edikty zasaď do politického kontextu.
- Stavby zaznamenej jako kulturní milníky.
- Zvěsti můžeš zmínit jako dobový pramen nebo lidovou paměť.
${includeMetrics ? "- ZAHRNUJ numerické metriky kde jsou dostupné (populace, síla armád, ztráty, obchodní objemy)." : "- NEZAHRNUJ numerické metriky, piš čistě narativně."}
- NESMÍŠ vymýšlet nové události. Narativně zpracuj POUZE dodaná data.
- Rozděl vyprávění do logických kapitol podle epoch/období.
- Výstup MUSÍ být v češtině.

EVENT-AWARE PRAVIDLA:
- Při psaní IDENTIFIKUJ všechny historické události, které popisuješ.
- Pokud událost odpovídá existujícímu záznamu, uveď její eventId.
- Pokud jde o NOVOU událost, nastav create=true a vyplň metadata.
- PREFERUJ propojení s existujícími událostmi místo duplicit.
- Každý zápis MUSÍ mít alespoň 1 event reference.
- Odpověz POUZE voláním funkce generate_world_history.`;

    const userPrompt = `Vygeneruj objektivní dějiny světa pro období roků ${fromTurn}–${toTurn}:

UDÁLOSTI:
${eventsText}

BITVY:
${battlesText || "žádné bitvy"}

PROHLÁŠENÍ A EDIKTY:
${declarationsText || "žádná prohlášení"}

DOKONČENÉ STAVBY:
${buildingsText || "žádné stavby"}

ZVĚSTI:
${rumorsText || "žádné zvěsti"}

FAKTA O SVĚTĚ:
${memoriesText || "žádné paměti"}

EXISTUJÍCÍ UDÁLOSTI V DATABÁZI:
${existingEventsText || "žádné"}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt,
      tools: [{
        type: "function",
        function: {
          name: "generate_world_history",
          description: "Return world history chapter with event metadata.",
          parameters: {
            type: "object",
            properties: {
              chapterTitle: { type: "string", description: "Chapter title in Czech" },
              chapterText: { type: "string", description: "Full chapter text in Czech" },
              eventsMentioned: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    eventId: { type: "string" },
                    confidence: { type: "number" },
                    create: { type: "boolean" },
                    dateGuess: { type: "string" },
                    locationGuess: { type: "string" },
                    summary: { type: "string" },
                    participants: { type: "array", items: { type: "string" } },
                    tags: { type: "array", items: { type: "string" } },
                  },
                  required: ["title", "confidence"],
                },
              },
            },
            required: ["chapterTitle", "chapterText", "eventsMentioned"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "generate_world_history" } },
    });

    if (!result.ok) {
      if (result.status === 429) return errorResponse("Rate limit", 429);
      if (result.status === 402) return jsonResponse({
        chapterTitle: `Dějiny (roky ${fromTurn}–${toTurn})`,
        chapterText: "Kronikář nemá prostředky. (AI kredity vyčerpány)",
        eventsMentioned: [],
      });
      throw new Error(result.error || "AI error");
    }

    if (!result.data.eventsMentioned) result.data.eventsMentioned = [];
    return jsonResponse(result.data);
  } catch (e) {
    console.error("world-history error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
