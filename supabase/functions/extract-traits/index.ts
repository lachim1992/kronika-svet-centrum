/**
 * extract-traits — Extracts entity traits from game events.
 * Uses createAIContext for premise injection (epoch/style affects trait language).
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { events, existingTraits, players, cities, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({ traits: [], debug: { provider: "placeholder" } });
    }

    const ctx = await createAIContext(sessionId);

    const existingTraitsSummary = (existingTraits || [])
      .map((t: any) => `${t.entity_name} (${t.entity_type}): ${t.trait_text}`)
      .join("\n");

    const result = await invokeAI(ctx, {
      systemPrompt: `Jsi historik a kronikář civilizační hry. Analyzuj herní události a extrahuj z nich vlastnosti, přídomky, pověsti a vztahy pro entity (města, vládce, osoby, armády, provincie).

Pravidla:
- Vycházej POUZE z potvrzených událostí — nic nevymýšlej.
- Vlastnost musí být odvozena z konkrétní události nebo vzorce událostí.
- Přídomky jsou krátké (2-5 slov): "Krutý", "Ochránce chudých", "Neporazitelný".
- Pověsti jsou delší popisy.
- Vztahy popisují vazby mezi entitami.
- NEopakuj existující vlastnosti.

Hráči: ${(players || []).join(", ")}
Města: ${(cities || []).map((c: any) => `${c.name} (${c.owner}, ${c.level})`).join(", ")}

Existující vlastnosti (neopakuj):
${existingTraitsSummary || "žádné"}`,
      userPrompt: `Analyzuj tyto události a navrhni nové vlastnosti entit:\n${JSON.stringify(events, null, 2)}`,
      tools: [{
        type: "function",
        function: {
          name: "extract_traits",
          description: "Extract entity traits from game events",
          parameters: {
            type: "object",
            properties: {
              traits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entity_type: { type: "string", enum: ["city", "ruler", "person", "army", "province", "civilization", "empire", "country"] },
                    entity_name: { type: "string" },
                    trait_category: { type: "string", enum: ["epithet", "title", "reputation", "characteristic", "relation", "history"] },
                    trait_text: { type: "string" },
                  },
                  required: ["entity_type", "entity_name", "trait_category", "trait_text"],
                  additionalProperties: false,
                },
              },
            },
            required: ["traits"], additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "extract_traits" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit" }, 429);
      if (result.status === 402) return jsonResponse({ error: "Payment required" }, 402);
      return jsonResponse({ traits: [], debug: result.debug });
    }

    return jsonResponse({ traits: result.data?.traits || [], debug: result.debug });
  } catch (e) {
    console.error("extract-traits error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
