import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      sessionId, round, confirmedEvents, annotations, worldMemories,
      battles, declarations, completedBuildings, rumors,
    } = await req.json();

    if (!sessionId) return errorResponse("Missing sessionId", 400);

    const ctx = await createAIContext(sessionId, round);

    // Check if saga generation is enabled
    const sagaEnabled = ctx.premise.narrativeRules?.saga?.enabled !== false;
    if (!sagaEnabled) {
      return jsonResponse({
        chronicleText: `📜 Rok ${round} — Generování kroniky je vypnuto v narativní konfiguraci.`,
        newSuggestedMemories: [],
        linkedCities: [],
      });
    }

    // ── Serialize all data sources ──
    const eventsText = (confirmedEvents || []).map((e: any) =>
      `[${e.event_type}] ${e.player}${e.location ? ` @ ${e.location}` : ""}${e.note ? ` — "${e.note}"` : ""}${e.result ? ` → ${e.result}` : ""}${e.casualties ? ` (ztráty: ${e.casualties})` : ""}${e.importance === "major" ? " [DŮLEŽITÉ]" : ""}${e.treaty_type ? ` [Smlouva: ${e.treaty_type}]` : ""}${e.terms_summary ? ` Podmínky: ${e.terms_summary}` : ""}`
    ).join("\n");

    const annotationsText = (annotations || []).map((a: any) =>
      `${a.author} o [${a.event_type || "události"}]: "${a.note_text}" (${a.visibility})`
    ).join("\n");

    const memoriesText = (worldMemories || []).map((m: any) =>
      typeof m === "string" ? m : `[${m.category || ""}] ${m.text}`
    ).join("\n");

    const battlesText = (battles || []).map((b: any) =>
      `BITVA: Útočník síla ${b.attacker_strength_snapshot} vs Obránce síla ${b.defender_strength_snapshot}. Výsledek: ${b.result}. Ztráty: útočník ${b.casualties_attacker}, obránce ${b.casualties_defender}.${b.speech_text ? ` Proslov: "${b.speech_text}"` : ""}${b.biome ? ` Terén: ${b.biome}` : ""}`
    ).join("\n");

    const declarationsText = (declarations || []).map((d: any) =>
      `PROHLÁŠENÍ [${d.declaration_type}] od ${d.player_name}${d.title ? ` — "${d.title}"` : ""}: ${d.epic_text || d.original_text}${d.tone ? ` (tón: ${d.tone})` : ""}`
    ).join("\n");

    const buildingsText = (completedBuildings || []).map((b: any) =>
      `STAVBA dokončena: "${b.name}" [${b.category}]${b.founding_myth ? ` — Mýtus: ${b.founding_myth}` : ""}${b.description ? ` Popis: ${b.description}` : ""}`
    ).join("\n");

    const rumorsText = (rumors || []).map((r: any) =>
      `ZVĚST z ${r.city_name} [${r.tone_tag}]: ${r.text}`
    ).join("\n");

    const systemPrompt = `Jsi kronikář civilizační deskové hry.

ÚKOL: Vygeneruj zápis kroniky pro rok ${round}. Tento zápis se stane trvalou součástí dějin světa.

PRAVIDLA:
- Zahrň VŠECHNY potvrzené události roku — žádná nesmí zůstat nezaznamenaná.
- Bitvy popiš dramaticky s důrazem na výsledek, ztráty a projevy velitelů.
- Prohlášení a edikty hráčů cituj nebo parafrázuj jako oficiální dokumenty.
- Dokončené stavby zaznamenej jako monumentální počiny s odkazem na jejich mýtus.
- Zvěsti a šuškandu zapracuj jako hlasy lidu nebo atmosféru ulice.
- Zapracuj poznámky hráčů jako citace, kontext nebo perspektivu do příběhu.
- Zohledni existující paměti světa pro kontinuitu.
- NESMÍŠ vymýšlet nové události — pouze narativně zpracuj dodaná data.
- Navrhni 0-3 nové paměti světa vyplývající z událostí roku.
- Uveď seznam měst, která se v kronice objevují.
- Výstup MUSÍ být v češtině.
- Odpověz POUZE voláním funkce write_round_chronicle.`;

    const userPrompt = `ROK ${round}

POTVRZENÉ UDÁLOSTI:
${eventsText || "žádné události"}

BITVY:
${battlesText || "žádné bitvy"}

PROHLÁŠENÍ A EDIKTY:
${declarationsText || "žádná prohlášení"}

DOKONČENÉ STAVBY:
${buildingsText || "žádné stavby"}

ZVĚSTI Z ULIC:
${rumorsText || "žádné zvěsti"}

POZNÁMKY HRÁČŮ:
${annotationsText || "žádné poznámky"}

PAMĚTI SVĚTA:
${memoriesText || "žádné paměti"}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt,
      tools: [{
        type: "function",
        function: {
          name: "write_round_chronicle",
          description: "Write chronicle entry for a specific round.",
          parameters: {
            type: "object",
            properties: {
              chronicleText: { type: "string", description: "Full chronicle text for this round in Czech" },
              newSuggestedMemories: {
                type: "array",
                items: { type: "string" },
                description: "Suggested new world memory facts in Czech",
              },
              linkedCities: {
                type: "array",
                items: { type: "string" },
                description: "Names of cities mentioned in the chronicle",
              },
            },
            required: ["chronicleText", "newSuggestedMemories", "linkedCities"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "write_round_chronicle" } },
    });

    if (!result.ok) {
      if (result.status === 429) return errorResponse("Rate limit", 429);
      if (result.status === 402) return jsonResponse({
        chronicleText: `📜 Rok ${round} — Kronikář nemá prostředky. (AI kredity vyčerpány)`,
        newSuggestedMemories: [], linkedCities: [],
      });
      throw new Error(result.error || "AI error");
    }

    return jsonResponse(result.data);
  } catch (e) {
    console.error("world-chronicle-round error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
