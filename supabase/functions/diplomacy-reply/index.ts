import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { npc, recentMessages, recentConfirmedEvents, worldFacts } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Placeholder response
      return new Response(
        JSON.stringify({
          replyText: `${npc.name} pokyne hlavou a praví: "Vaše slova jsme vyslechli. Budeme o nich uvažovat." Diplomat se ukloní a odejde.`,
          suggestedActionEvent: null,
          debug: { provider: "placeholder" },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Jsi středověký diplomat zastupující městský stát "${npc.name}" (typ: ${npc.type}, nálada: ${npc.mood}).
Odpovídej VŽDY česky v tónu středověké diplomatické korespondence.
Buď stručný (max 3 věty). Reaguj na poslední zprávy v konverzaci.
Nikdy nevymýšlej numerické výsledky ani nové události — pouze diplomatickou odpověď.
Tvá nálada ovlivňuje tón: přátelský stát je vstřícný, nepřátelský je chladný nebo výhružný.`;

    const messagesForAI = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Kontext světa: ${JSON.stringify(worldFacts?.slice(0, 10) || [])}
Nedávné události: ${JSON.stringify(recentConfirmedEvents?.slice(0, 5) || [])}
Poslední zprávy v diplomatické konverzaci:
${(recentMessages || []).map((m: any) => `[${m.sender}]: ${m.message_text}`).join("\n")}

Odpověz jako diplomat městského státu ${npc.name}.`,
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: messagesForAI,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, zkuste později." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Nedostatek kreditů." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const replyText = aiData.choices?.[0]?.message?.content || "Diplomat mlčí...";

    return new Response(
      JSON.stringify({
        replyText,
        suggestedActionEvent: null,
        debug: { provider: "lovable-ai" },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Diplomacy reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
