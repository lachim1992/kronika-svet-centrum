import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entityType, entityName, shortText, contentType, sessionId } = await req.json();

    if (!sessionId) return errorResponse("Missing sessionId", 400);

    const ctx = await createAIContext(sessionId);

    const typeLabels: Record<string, string> = {
      lore: "příběh nebo legendu", building: "popis stavby nebo budovy",
      monument: "popis monumentu nebo pomníku", legend: "místní legendu",
      battle_account: "válečný záznam", cultural_note: "kulturní poznámku",
      rumor: "zvěst nebo drb",
    };

    const systemPrompt = `Jsi kronikář fantasy světa. Hráč zadal krátký vstup a ty ho rozšíříš do plnohodnotného narativního textu.

PRAVIDLA:
- Piš v češtině, formálním ale čtivým stylem
- Rozšiř hráčův vstup na 2-4 odstavce bohatého textu
- NEVYMÝŠLEJ nová fakta, pouze rozváděj to, co hráč napsal
- Zachovej hráčův záměr a ton
- Odpověz POUZE voláním funkce expand_contribution`;

    const userPrompt = `Rozšiř tento hráčský vstup o entitě "${entityName}" (${entityType}) do ${typeLabels[contentType] || "narativního textu"}:

"${shortText}"`;

    const result = await invokeAI(ctx, {
      model: "google/gemini-2.5-flash",
      systemPrompt,
      userPrompt,
      tools: [{
        type: "function",
        function: {
          name: "expand_contribution",
          description: "Return the expanded contribution text",
          parameters: {
            type: "object",
            properties: {
              expandedText: { type: "string", description: "Expanded narration in Czech, 2-4 paragraphs" },
              imagePrompt: { type: "string", description: "English prompt for illustration" },
            },
            required: ["expandedText"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "expand_contribution" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit" }, 429);
      return errorResponse(result.error || "AI gateway error");
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("expand-contribution error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
