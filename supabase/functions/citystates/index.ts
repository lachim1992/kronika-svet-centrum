import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cityStates, recentEvents, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({
        actions: (cityStates || []).map((cs: any) => ({
          cityStateName: cs.name, action: "Městský stát vyčkává...", type: "wait"
        }))
      });
    }

    const ctx = await createAIContext(sessionId);

    const systemPrompt = `Jsi AI řídící NPC městské státy v civilizační deskové hře. Pro každý městský stát vygeneruj 1-2 akce na základě jeho typu, nálady a vlivu hráčů.

Typy akcí: nabídka obchodu, požadavek tributu, vyhlášení embarga, poskytnutí pomoci, najatí nájezdníků, vyčkávání.

Odpověz česky. Buď kreativní a vtipný.`;

    const userContent = `Městské státy:\n${JSON.stringify(cityStates, null, 2)}\n\nNedávné události:\n${JSON.stringify(recentEvents, null, 2)}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: userContent,
      tools: [{
        type: "function",
        function: {
          name: "city_state_actions",
          description: "Generate NPC city-state actions",
          parameters: {
            type: "object",
            properties: {
              actions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    cityStateName: { type: "string" },
                    action: { type: "string" },
                    type: { type: "string", enum: ["trade", "tribute", "embargo", "aid", "raiders", "wait"] },
                    targetPlayer: { type: "string" }
                  },
                  required: ["cityStateName", "action", "type"],
                  additionalProperties: false
                }
              }
            },
            required: ["actions"],
            additionalProperties: false
          }
        }
      }],
      toolChoice: { type: "function", function: { name: "city_state_actions" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Příliš mnoho požadavků." }, 429);
      return jsonResponse({ actions: [], debug: result.debug });
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("citystates error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
