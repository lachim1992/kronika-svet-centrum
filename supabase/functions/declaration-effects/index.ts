/**
 * declaration-effects — Suggests trait effects from declarations.
 * Uses createAIContext for premise injection (world context, constraints).
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { declarationText, declarationType, tone, playerName, cities, recentEvents, worldFacts, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({
        effects: [{
          entity_type: "EMPIRE", entity_id: null, trait_key: "declaration_effect",
          trait_label: "Vyhlašovatel", description: `${playerName} vydal oficiální vyhlášení.`,
          intensity: 1, explanation: "Automaticky navržený rys."
        }]
      });
    }

    const ctx = await createAIContext(sessionId, undefined, undefined, playerName);

    const result = await invokeAI(ctx, {
      systemPrompt: `Jsi analytik civilizační deskové hry. Na základě textu vyhlášení navrhni 2-5 rysů (traits), které by toto vyhlášení mělo přidat nebo posílit entitám (říši, městům, vůdcům, armádám).

PRAVIDLA:
- Piš česky.
- Rysy ovlivňují narativ, pověst, diplomacii – NE herní mechaniky.
- Každý rys musí mít trait_key (snake_case anglicky), trait_label (česky), description (1-2 věty česky), intensity (1-5), explanation (proč tento rys).
- entity_type: EMPIRE, CITY, LEADER, ARMY, PROVINCE
- entity_id ponech null (uživatel vybere cíl).
- Buď kreativní ale realistický.`,
      userPrompt: `Typ vyhlášení: ${declarationType}\nTón: ${tone}\nAutor: ${playerName}\n\nText vyhlášení:\n${declarationText}\n\nMěsta autora: ${JSON.stringify(cities?.slice(0, 10) || [])}\nNedávné události: ${JSON.stringify(recentEvents?.slice(0, 10) || [])}\nFakta o světě: ${JSON.stringify(worldFacts?.slice(0, 10) || [])}`,
      tools: [{
        type: "function",
        function: {
          name: "suggest_declaration_effects",
          description: "Suggest trait effects from a declaration",
          parameters: {
            type: "object",
            properties: {
              effects: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entity_type: { type: "string", enum: ["EMPIRE", "CITY", "LEADER", "ARMY", "PROVINCE"] },
                    entity_id: { type: "string", description: "null - user picks target" },
                    trait_key: { type: "string" },
                    trait_label: { type: "string" },
                    description: { type: "string" },
                    intensity: { type: "number" },
                    explanation: { type: "string" },
                  },
                  required: ["entity_type", "trait_key", "trait_label", "description", "intensity", "explanation"],
                  additionalProperties: false,
                },
              },
            },
            required: ["effects"], additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "suggest_declaration_effects" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit, zkuste později." }, 429);
      if (result.status === 402) return jsonResponse({ error: "Kredit vyčerpán." }, 402);
      return jsonResponse({ effects: [], debug: result.debug });
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("declaration-effects error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
