import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { city, confirmedCityEvents, approvedWorldFacts, cityMemories, provinceMemories, sessionId } = await req.json();

    const effectiveSessionId = sessionId || city?.sessionId;
    if (!effectiveSessionId) {
      return jsonResponse({
        introduction: `${city?.name || "Město"} je sídlo bez záznamu.`,
        historyRetelling: "", bulletFacts: [],
        debug: { usedProvider: "fallback-no-session" }
      });
    }

    const ctx = await createAIContext(effectiveSessionId);

    // Fetch flavor prompt from city if available
    let flavorNote = "";
    if (city?.ownerFlavorPrompt) {
      flavorNote = `\n\nVlastník města si přeje tento stylový kontext (použij POUZE pro tón a atmosféru, NEVYMÝŠLEJ fakta): "${city.ownerFlavorPrompt}"`;
    }

    const cityMemsText = (cityMemories || []).map((m: any) => `[${m.category || "tradition"}] ${m.text}`).join("\n");
    const provMemsText = (provinceMemories || []).map((m: any) => `[${m.category || "tradition"}] ${m.text}`).join("\n");

    const systemPrompt = `Jsi kronikář civilizační deskové hry. Tvým úkolem je napsat představení města a převyprávět jeho historii.

PRAVIDLA:
- Piš česky.
- NEVYMÝŠLEJ události ani čísla. Pracuj POUZE s poskytnutými daty.
- Pokud chybí informace, řekni že jsou neznámé.
- Události převyprávěj objektivně.
- MUSÍŠ zapracovat lokální paměti města (tradice, jizvy, kulturní rysy) do představení.
- Rysy města vyplývají z opakovaných pamětí.${flavorNote}`;

    const userContent = `Město: ${JSON.stringify(city, null, 2)}

Potvrzené události města (${confirmedCityEvents?.length || 0}):
${JSON.stringify(confirmedCityEvents || [], null, 2)}

Schválené světové fakty:
${JSON.stringify(approvedWorldFacts || [], null, 2)}

Lokální paměti města:
${cityMemsText || "žádné"}

Paměti provincie:
${provMemsText || "žádné"}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: userContent,
      tools: [{
        type: "function",
        function: {
          name: "write_city_profile",
          description: "Write city introduction and history retelling",
          parameters: {
            type: "object",
            properties: {
              introduction: { type: "string" },
              historyRetelling: { type: "string" },
              bulletFacts: { type: "array", items: { type: "string" } }
            },
            required: ["introduction", "historyRetelling", "bulletFacts"],
            additionalProperties: false
          }
        }
      }],
      toolChoice: { type: "function", function: { name: "write_city_profile" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Příliš mnoho požadavků." }, 429);
      if (result.status === 402) return jsonResponse({
        introduction: `${city?.name || "Město"} — kronikář nemá prostředky.`,
        historyRetelling: "", bulletFacts: [], debug: result.debug
      });
      return jsonResponse({ introduction: "Kronikář selhal...", historyRetelling: "", bulletFacts: [], debug: result.debug });
    }

    return jsonResponse({ ...result.data, debug: { ...result.debug, eventCount: confirmedCityEvents?.length || 0 } });
  } catch (e) {
    console.error("cityprofile error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
