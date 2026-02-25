import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, city, era, worldFacts, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({
        wonderName: `Div ${city || "neznámého města"}`,
        description: `Legendární stavba v ${city || "neznámém městě"}.`,
        memoryFact: `V ${city || "neznámém městě"} stojí div.`,
        bonusEffect: null,
        imagePrompt: `A majestic ancient wonder in a ${era || "medieval"} city, illuminated manuscript style`,
        debug: { provider: "fallback-no-session" }
      });
    }

    const ctx = await createAIContext(sessionId);

    const systemPrompt = `Jsi legendární kronikář a architekt divů světa v civilizační deskové hře. Tvým úkolem je na základě hráčova popisu vytvořit epický div světa.

Odpověz pomocí funkce create_wonder. Piš česky. Jméno divu by mělo být krátké a vznešené. Popis by měl být 2-4 věty. imagePrompt MUSÍ být v angličtině.

Existující fakta o světě:
${JSON.stringify(worldFacts || [])}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: `Hráčův popis: "${prompt}"\nMěsto: ${city || "neznámé"}\nÉra: ${era || "Ancient"}`,
      tools: [{
        type: "function",
        function: {
          name: "create_wonder",
          description: "Create a world wonder with all details",
          parameters: {
            type: "object",
            properties: {
              wonderName: { type: "string", description: "Short majestic name in Czech" },
              description: { type: "string", description: "Epic chronicle-style description in Czech, 2-4 sentences" },
              memoryFact: { type: "string", description: "A world memory fact about this wonder in Czech" },
              bonusEffect: { type: "string", description: "Optional short game bonus effect in Czech, or null" },
              imagePrompt: { type: "string", description: "English visual description for image generation" },
            },
            required: ["wonderName", "description", "memoryFact", "imagePrompt"],
            additionalProperties: false
          }
        }
      }],
      toolChoice: { type: "function", function: { name: "create_wonder" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Příliš mnoho požadavků." }, 429);
      if (result.status === 402) return jsonResponse({ error: "Kredit vyčerpán." }, 402);
      return jsonResponse({
        wonderName: `Div ${city || "světa"}`, description: "Kronikář selhal...",
        memoryFact: "", bonusEffect: null, imagePrompt: "A majestic ancient wonder",
        debug: result.debug
      });
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("wonder error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
