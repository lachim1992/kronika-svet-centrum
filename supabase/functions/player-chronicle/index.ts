import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      sessionId, playerName, civName, events, playerCities, playerMemories,
      rivalInfo, fromTurn, toTurn, existingWorldEvents,
      battles, declarations, completedBuildings, rumors,
    } = await req.json();

    if (!sessionId || !playerName) return errorResponse("Missing sessionId or playerName", 400);

    const ctx = await createAIContext(sessionId, toTurn);

    // Check if saga generation is enabled
    const sagaEnabled = ctx.premise.narrativeRules?.saga?.enabled !== false;
    if (!sagaEnabled) {
      return jsonResponse({
        chapterTitle: `Rok ${fromTurn}–${toTurn}`,
        chapterText: "Generování osobní kroniky je vypnuto v narativní konfiguraci.",
        eventsMentioned: [],
      });
    }

    const stance = ctx.premise.narrativeRules?.saga?.stance || "pro-regime";

    // ── Serialize data ──
    const eventsText = (events || []).map((e: any) =>
      `[Rok ${e.turn_number}] ${e.player}: ${e.event_type}${e.location ? ` u ${e.location}` : ""}${e.note ? ` — ${e.note}` : ""}${e.result ? ` → ${e.result}` : ""}${e.importance === "major" ? " [DŮLEŽITÉ]" : ""}`
    ).join("\n");

    const citiesText = playerCities?.length
      ? `\nMěsta ${playerName}: ${playerCities.map((c: any) => `${c.name} (${c.level})`).join(", ")}`
      : "";

    const memoriesText = playerMemories?.length
      ? `\nPaměti říše:\n${playerMemories.map((m: any) => `- ${typeof m === "string" ? m : m.text}`).join("\n")}`
      : "";

    const rivalText = rivalInfo?.length
      ? `\nZvěsti o soupeřích:\n${rivalInfo.map((r: any) => `- ${typeof r === "string" ? r : `${r.player}: ${r.event_type} — ${r.note || ""}`}`).join("\n")}`
      : "";

    const battlesText = (battles || []).map((b: any) =>
      `BITVA: síla ${b.attacker_strength_snapshot} vs ${b.defender_strength_snapshot}, výsledek: ${b.result}, ztráty: ${b.casualties_attacker}/${b.casualties_defender}${b.speech_text ? `, proslov: "${b.speech_text}"` : ""}`
    ).join("\n");

    const declarationsText = (declarations || []).map((d: any) =>
      `PROHLÁŠENÍ [${d.declaration_type}] ${d.player_name}: ${d.epic_text || d.original_text}`
    ).join("\n");

    const buildingsText = (completedBuildings || []).map((b: any) =>
      `STAVBA: "${b.name}" [${b.category}]${b.founding_myth ? ` — ${b.founding_myth}` : ""}`
    ).join("\n");

    const rumorsText = (rumors || []).map((r: any) =>
      `ZVĚST z ${r.city_name}: ${r.text}`
    ).join("\n");

    const existingEventsText = (existingWorldEvents || []).map((e: any) =>
      `- id="${e.id}" title="${e.title}"${e.summary ? ` summary="${e.summary}"` : ""}`
    ).join("\n");

    const stanceInstruction: Record<string, string> = {
      "pro-regime": `Piš jako dvorní kronikář civilizace "${civName || playerName}". Oslavuj úspěchy, porážky prezentuj jako hrdinské oběti.`,
      "neutral": `Piš neutrálně o civilizaci "${civName || playerName}". Fakticky, bez zbytečného patosu.`,
      "critical": `Piš kriticky o civilizaci "${civName || playerName}". Zpochybňuj rozhodnutí, upozorňuj na slabiny.`,
      "mythical": `Piš jako mýtický bard civilizace "${civName || playerName}". Vše je osudové, legendární, nadpřirozené.`,
    };

    const systemPrompt = `${stanceInstruction[stance] || stanceInstruction["pro-regime"]}

PRAVIDLA:
- Piš z PERSPEKTIVY hráče ${playerName} a jeho říše.
- Bitvy popiš dramaticky, prohlášení cituj, stavby oslav.
- Zvěsti zapracuj jako hlasy poddaných a atmosféru.
- Události jiných hráčů popisuj z pohledu rivala/pozorovatele.
- NESMÍŠ vymýšlet nové události. Narativně zpracuj POUZE dodaná data.
- Výstup MUSÍ být v češtině.

EVENT-AWARE PRAVIDLA:
- IDENTIFIKUJ všechny historické události zmíněné v textu.
- Pokud událost odpovídá existujícímu záznamu, uveď její eventId.
- Pokud jde o NOVOU událost, nastav create=true a vyplň metadata.
- PREFERUJ existující události místo duplicit.
- Každý kronikový zápis MUSÍ mít alespoň 1 event reference.
- Odpověz POUZE voláním funkce generate_player_chronicle.`;

    const userPrompt = `Vygeneruj osobní kroniku říše "${civName || playerName}" pro období roků ${fromTurn}–${toTurn}:

UDÁLOSTI:
${eventsText}${citiesText}${memoriesText}${rivalText}

BITVY:
${battlesText || "žádné"}

PROHLÁŠENÍ:
${declarationsText || "žádná"}

STAVBY:
${buildingsText || "žádné"}

ZVĚSTI:
${rumorsText || "žádné"}

EXISTUJÍCÍ UDÁLOSTI V DATABÁZI:
${existingEventsText || "žádné"}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt,
      tools: [{
        type: "function",
        function: {
          name: "generate_player_chronicle",
          description: "Return player chronicle chapter with event metadata.",
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
      toolChoice: { type: "function", function: { name: "generate_player_chronicle" } },
    });

    if (!result.ok) {
      if (result.status === 429) return errorResponse("Rate limit", 429);
      if (result.status === 402) return errorResponse("Nedostatek kreditů", 402);
      throw new Error(result.error || "AI error");
    }

    if (!result.data.eventsMentioned) result.data.eventsMentioned = [];
    return jsonResponse(result.data);
  } catch (e) {
    console.error("player-chronicle error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
