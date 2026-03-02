import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, sessionId, playerName, currentTurn, decreeType, decreeText, context } = await req.json();

    if (!sessionId) throw new Error("Missing sessionId");

    // ── Load unified AI context ──
    const aiCtx = await createAIContext(sessionId, currentTurn, undefined, playerName);

    if (action === "preview_decree") {
      const systemPrompt = `Jsi středověký královský rádce hodnotící navržený dekret vládce.
Hodnoť na základě poskytnutého herního stavu. Nevymýšlej fakta.`;

      const userPrompt = `Vládce: ${playerName}
Kolo: ${currentTurn}
Typ dekretu: ${decreeType}
Text dekretu: "${decreeText}"

Herní stav:
- Města: ${JSON.stringify(context?.cities || [])}
- Armád: ${context?.armies || 0}
- Zdroje: ${JSON.stringify(context?.resources || [])}
- Aktivní krize: ${JSON.stringify(context?.crises || [])}

Zhodnoť tento dekret a vrať strukturovaný výstup.`;

      const result = await invokeAI(aiCtx, {
        systemPrompt,
        userPrompt,
        tools: [{
          type: "function",
          function: {
            name: "evaluate_decree",
            description: "Return structured evaluation of the proposed decree",
            parameters: {
              type: "object",
              properties: {
                effects: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      value: { type: "number" },
                    },
                    required: ["label", "value"],
                  },
                },
                riskLevel: { type: "string", description: "Nízké, Střední, or Vysoké" },
                narrativeText: { type: "string", description: "Chronicle entry in Czech" },
              },
              required: ["effects", "riskLevel", "narrativeText"],
            },
          },
        }],
        toolChoice: { type: "function", function: { name: "evaluate_decree" } },
      });

      if (!result.ok) {
        if (result.status === 429) return jsonResponse({ error: "Rate limit exceeded" }, 429);
        if (result.status === 402) return jsonResponse({ error: "Payment required" }, 402);
        throw new Error(result.error || "AI error");
      }

      return jsonResponse(result.data || {
        effects: [{ label: "Stabilita", value: 1 }],
        riskLevel: "Střední",
        narrativeText: "Rada zvážila návrh.",
      });
    }

    if (action === "generate_law_draft") {
      const systemPrompt = `Jsi středověký právní poradce královské rady. Na základě dekretu vládce vytvoř formální návrh zákona.
Zákon musí mít formální název, plný text (3-6 vět, formální středověký styl) a mechanické efekty.
Buď konkrétní a realistický na základě herního stavu.`;

      const userPrompt = `Vládce: ${playerName}
Kolo: ${currentTurn}
Typ dekretu: ${decreeType}
Text dekretu: "${decreeText}"

Herní stav:
- Města: ${JSON.stringify(context?.cities || [])}
- Armád: ${context?.armies || 0}
- Zdroje: ${JSON.stringify(context?.resources || [])}

Vygeneruj formální návrh zákona.`;

      const result = await invokeAI(aiCtx, {
        systemPrompt,
        userPrompt,
        tools: [{
          type: "function",
          function: {
            name: "create_law_draft",
            description: "Create a formal law draft from the decree",
            parameters: {
              type: "object",
              properties: {
                lawName: { type: "string" },
                fullText: { type: "string" },
                effects: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      value: { type: "number" },
                      label: { type: "string" },
                    },
                    required: ["type", "value", "label"],
                  },
                },
              },
              required: ["lawName", "fullText", "effects"],
            },
          },
        }],
        toolChoice: { type: "function", function: { name: "create_law_draft" } },
      });

      if (!result.ok) throw new Error(result.error || "AI error");

      return jsonResponse(result.data || {
        lawName: "Nový zákon",
        fullText: decreeText,
        effects: [{ type: "civil_reform", value: 1, label: "Reforma" }],
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("royal-council error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});