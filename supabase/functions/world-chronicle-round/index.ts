import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      sessionId, round, confirmedEvents, annotations, worldMemories,
      battles, declarations, completedBuildings, rumors, playerReactions,
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
    // Patch 9d: enrich node-related events with culture/profile/anex context
    const NODE_EVENT_TYPES = new Set([
      "exploration", "trade_link_opened", "envoy_sent",
      "military_pressure_applied", "node_annexed",
    ]);
    const renderNodeEvent = (e: any): string | null => {
      if (!NODE_EVENT_TYPES.has(e.event_type)) return null;
      const ref = e.reference || {};
      const culture = ref.culture ? ` kultury ${ref.culture}` : "";
      const profile = ref.profile ? ` [${ref.profile}]` : "";
      const nodeName = ref.node_name || "";
      const nodes = Array.isArray(ref.discovered_nodes) ? ref.discovered_nodes : [];
      switch (e.event_type) {
        case "exploration":
          if (nodes.length > 0) {
            const list = nodes.map((n: any) =>
              `${n.name}${n.culture ? ` (${n.culture})` : ""}${n.profile ? ` [${n.profile}]` : ""}`
            ).join(", ");
            return `[OBJEV] ${e.player} objevil neutrální uzly: ${list}.`;
          }
          return `[PRŮZKUM] ${e.player} prozkoumal hex ${e.location || ""}.`;
        case "trade_link_opened":
          return `[OBCHOD] ${e.player} otevřel obchodní spojení s uzlem ${nodeName}${culture}${profile}.`;
        case "envoy_sent":
          return `[DIPLOMACIE] ${e.player} vyslal vyslance k ${nodeName}${culture}${profile}.`;
        case "military_pressure_applied":
          return `[NÁTLAK] ${e.player} vyvíjí vojenský tlak na ${nodeName}${culture}${profile}.`;
        case "node_annexed":
          return `[ANEXE] ${e.player} pohltil uzel ${nodeName}${culture}${profile} a začlenil jej do své říše.`;
      }
      return null;
    };

    const eventsText = (confirmedEvents || []).map((e: any) => {
      const enriched = renderNodeEvent(e);
      if (enriched) return enriched + (e.importance === "major" ? " [DŮLEŽITÉ]" : "");
      return `[${e.event_type}] ${e.player}${e.location ? ` @ ${e.location}` : ""}${e.note ? ` — "${e.note}"` : ""}${e.result ? ` → ${e.result}` : ""}${e.casualties ? ` (ztráty: ${e.casualties})` : ""}${e.importance === "major" ? " [DŮLEŽITÉ]" : ""}${e.treaty_type ? ` [Smlouva: ${e.treaty_type}]` : ""}${e.terms_summary ? ` Podmínky: ${e.terms_summary}` : ""}`;
    }).join("\n");

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

    const reactionsText = (playerReactions || []).map((r: any) =>
      `REAKCE HRÁČE ${r.player}${r.event_type ? ` na [${r.event_type}]` : ""}: "${r.text}"`
    ).join("\n");

    const systemPrompt = `Jsi kronikář civilizační deskové hry.

ÚKOL: Vygeneruj zápis kroniky pro rok ${round}. Tento zápis se stane trvalou součástí dějin světa.

PRAVIDLA:
- Zahrň VŠECHNY potvrzené události roku — žádná nesmí zůstat nezaznamenaná.
- Bitvy popiš dramaticky s důrazem na výsledek, ztráty a projevy velitelů.
- Prohlášení a edikty hráčů cituj nebo parafrázuj jako oficiální dokumenty.
- Dokončené stavby zaznamenej jako monumentální počiny s odkazem na jejich mýtus.
- Zvěsti a šuškandu zapracuj jako hlasy lidu nebo atmosféru ulice.
- Zapracuj poznámky a anotace hráčů jako citace, kontext nebo perspektivu do příběhu.
- REAKCE HRÁČŮ (komentáře, reakce na události) zapracuj jako hlasy účastníků, diplomatické poznámky, výroky vládců nebo městskou šuškandu.
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

REAKCE A KOMENTÁŘE HRÁČŮ:
${reactionsText || "žádné reakce"}

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
