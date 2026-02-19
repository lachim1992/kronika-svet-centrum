import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, sessionId, playerName, currentTurn, decreeType, decreeText, context } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (action === "preview_decree") {
      const systemPrompt = `You are a medieval royal council advisor evaluating a ruler's proposed decree.
You must evaluate based on the provided game state and return a structured assessment.
Always respond in Czech language.
Be realistic and grounded in the provided data. Do not invent facts not present in the context.`;

      const userPrompt = `Ruler: ${playerName}
Current Turn: ${currentTurn}
Decree Type: ${decreeType}
Decree Text: "${decreeText}"

Game State:
- Cities: ${JSON.stringify(context?.cities || [])}
- Army count: ${context?.armies || 0}
- Resources: ${JSON.stringify(context?.resources || [])}
- Active crises: ${JSON.stringify(context?.crises || [])}

Evaluate this decree and return the assessment.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
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
                    description: "List of stat changes, e.g. [{label:'Stabilita', value:2}, {label:'Příjem', value:-3}]",
                  },
                  riskLevel: { type: "string", description: "Risk level: Nízké, Střední, or Vysoké" },
                  narrativeText: { type: "string", description: "A short narrative description of what happens when the decree is enacted, written as a chronicle entry in Czech" },
                },
                required: ["effects", "riskLevel", "narrativeText"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "evaluate_decree" } },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Payment required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI error: ${response.status}`);
      }

      const aiData = await response.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback if no tool call
      return new Response(JSON.stringify({
        effects: [{ label: "Stabilita", value: 1 }],
        riskLevel: "Střední",
        narrativeText: aiData.choices?.[0]?.message?.content || "Rada zvážila návrh.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("royal-council error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
