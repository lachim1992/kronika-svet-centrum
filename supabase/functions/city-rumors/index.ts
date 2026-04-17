import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";
import { buildBasketSnapshot } from "../_shared/basket-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cityName, ownerPlayer, currentTurn, confirmedEvents, leakableNotes, memories, epochStyle, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({
        rumors: [{ text: `V ${cityName} je ticho...`, type: "rumor", sourceEventTypes: [], references: [] }]
      });
    }

    const ctx = await createAIContext(sessionId, currentTurn);

    const eventsText = (confirmedEvents || []).map((e: any) =>
      `[${e.event_type}] ${e.player}${e.location ? ` @ ${e.location}` : ""}${e.note ? ` — "${e.note}"` : ""}${e.result ? ` (${e.result})` : ""}`
    ).join("\n");
    const leakableText = (leakableNotes || []).map((n: any) => `${n.author}: "${n.note_text}"`).join("\n");
    const memoriesText = (memories || []).join("\n");

    // Resolve city_id for basket snapshot (city-scoped)
    let basketSnapshot = "";
    try {
      const sb = getServiceClient();
      const { data: cityRow } = await sb
        .from("cities")
        .select("id")
        .eq("session_id", sessionId)
        .eq("name", cityName)
        .maybeSingle();
      if (cityRow?.id) {
        basketSnapshot = await buildBasketSnapshot(sb, { sessionId, cityId: cityRow.id, limit: 6 });
      }
    } catch { /* non-fatal */ }

    const systemPrompt = `Jsi síť šeptandů, obchodníků a obyvatel města ${cityName} (vládce: ${ownerPlayer}).
Generuješ LOKÁLNÍ ZVĚSTI A DRBY z perspektivy běžných obyvatel.

${basketSnapshot ? basketSnapshot + "\n\n" : ""}PRAVIDLA:
- Vygeneruj 3-5 zvěstí z pohledu lidí žijících v ${cityName}.
- Zvěsti MUSÍ vycházet z dodaných událostí, poznámek a tradic.
- Pokud je některý koš v deficitu (🔴 nebo ⚠️), zvěsti to mohou narativně reflektovat (stížnosti, fámy o nedostatku) — bez vymýšlení čísel.
- Typy: "gossip", "news", "propaganda".
- Zmiňuj konkrétní jména.
- Výstup v češtině.
- Odpověz POUZE voláním funkce generate_city_rumors.`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: `MĚSTO: ${cityName} (vládce: ${ownerPlayer})\nROK: ${currentTurn}\n\nUDÁLOSTI:\n${eventsText || "žádné"}\n\nÚNIKOVÉ POZNÁMKY:\n${leakableText || "žádné"}\n\nMÍSTNÍ TRADICE:\n${memoriesText || "žádné"}`,
      tools: [{
        type: "function",
        function: {
          name: "generate_city_rumors",
          description: "Generate local rumors and gossip for a specific city.",
          parameters: {
            type: "object",
            properties: {
              rumors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    type: { type: "string", enum: ["gossip", "news", "propaganda"] },
                    sourceEventTypes: { type: "array", items: { type: "string" } },
                    references: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { type: { type: "string" }, name: { type: "string" } },
                        required: ["type", "name"], additionalProperties: false,
                      },
                    },
                  },
                  required: ["text", "type", "sourceEventTypes"],
                  additionalProperties: false,
                },
              },
            },
            required: ["rumors"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "generate_city_rumors" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit" }, 429);
      return jsonResponse({ rumors: [], debug: result.debug });
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("city-rumors error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
