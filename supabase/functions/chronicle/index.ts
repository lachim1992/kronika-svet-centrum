import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { events, memories, epochStyle, entityTraits, cityMemories, sessionId } = await req.json();

    if (!sessionId) {
      // Legacy fallback — generate without premise
      return jsonResponse({ chronicle: "Chybí sessionId pro generování kroniky.", suggestedMemories: [] });
    }

    const ctx = await createAIContext(sessionId);

    const traitsContext = (entityTraits || [])
      .filter((t: any) => t.is_active)
      .map((t: any) => `${t.entity_name} (${t.entity_type}): [${t.trait_category}] ${t.trait_text}`)
      .join("\n");

    const cityMemoriesContext = (cityMemories || [])
      .map((m: any) => `[${m.cityName || "?"}] (${m.category || "tradition"}): ${m.text}`)
      .join("\n");

    const systemPrompt = `Jsi kronikář civilizační deskové hry.

Tvým úkolem je:
1. Převést potvrzené herní události do narativního textu kroniky (česky).
2. Navrhnout 0-3 nové "vzpomínky světa" — trvalé fakty, tradice, nebo vtipné poznámky, které vyplývají z událostí.

DŮLEŽITÉ: Při psaní kroniky MUSÍŠ zohlednit zaznamenané vlastnosti entit (přídomky, pověsti, tituly, vztahy).
Používej přídomky a tituly vládců, zmiňuj pověsti měst, reflektuj zaznamenané vztahy mezi entitami.

GEOGRAFICKÁ PAMĚŤ: Musíš přirozeně zapracovat lokální paměti měst, která jsou zapojena v událostech kola.

Odpověz POUZE voláním funkce write_chronicle.`;

    const userContent = `Potvrzené události:\n${JSON.stringify(events, null, 2)}\n\nExistující paměť světa:\n${JSON.stringify(memories, null, 2)}\n\nLokální paměti měst:\n${cityMemoriesContext || "žádné"}\n\nVlastnosti entit:\n${traitsContext || "žádné"}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: userContent,
      tools: [{
        type: "function",
        function: {
          name: "write_chronicle",
          description: "Write chronicle text and suggest world memories",
          parameters: {
            type: "object",
            properties: {
              chronicle: { type: "string", description: "Chronicle narrative text in Czech" },
              suggestedMemories: {
                type: "array",
                items: { type: "string" },
                description: "Suggested world memory facts in Czech"
              }
            },
            required: ["chronicle", "suggestedMemories"],
            additionalProperties: false
          }
        }
      }],
      toolChoice: { type: "function", function: { name: "write_chronicle" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Příliš mnoho požadavků, zkuste to později." }, 429);
      if (result.status === 402) return jsonResponse({ error: "Kredit vyčerpán." }, 402);
      return jsonResponse({
        chronicle: "Kronikář selhal... zkuste to znovu.",
        suggestedMemories: [],
        debug: result.debug,
      });
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("chronicle error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
