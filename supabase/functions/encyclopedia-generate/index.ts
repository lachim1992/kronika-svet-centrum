import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entityType, entityName, context, relatedEvents, worldMemories, epochStyle, sessionId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch Chronicle 0 (Prolog) for narrative grounding
    let chronicle0Text = "";
    if (sessionId) {
      try {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: c0 } = await sb
          .from("chronicle_entries")
          .select("text")
          .eq("session_id", sessionId)
          .eq("source_type", "chronicle_zero")
          .maybeSingle();
        chronicle0Text = (c0 as any)?.text || "";
      } catch { /* ignore */ }
    }

    const typeInstructions: Record<string, string> = {
      city: `Piš encyklopedický článek o městě "${entityName}". Zahrň jeho historii, architekturu, kulturu a význam.`,
      province: `Piš encyklopedický článek o provincii "${entityName}". Popiš její geografii, města, tradice a historii.`,
      region: `Piš encyklopedický článek o regionu "${entityName}". Popiš krajinu, klima, národy a historické události.`,
      event: `Piš historický záznam o události "${entityName}". Popiš příčiny, průběh, důsledky a účastníky.`,
      character: `Piš biografii osobnosti "${entityName}". Zahrň původ, činy, odkaz a vztahy.`,
      faction: `Piš článek o frakci/organizaci "${entityName}". Popiš její vznik, cíle, členy a vliv.`,
    };

    const eventsText = (relatedEvents || []).map((e: any) =>
      `- "${e.title}"${e.date ? ` (${e.date})` : ""}: ${e.summary || e.description || "bez popisu"}`
    ).join("\n");

    const systemPrompt = `Jsi encyklopedista fantasy světa. Tvým úkolem je psát detailní, bohatě narativní encyklopedické články v češtině.

${typeInstructions[entityType] || typeInstructions.city}

PRAVIDLA:
- Piš v češtině, formálním encyklopedickým stylem.
- Zpracuj POUZE dodaná data, NEVYMÝŠLEJ nové události.
- Zmiň důležité události, které se odehrály v/kolem entity.
- Článek musí mít: úvodní odstavec, historii, a závěrečné shrnutí.
- Pokud existuje Prolog světa, MUSÍŠ na něj navázat — legendární postavy, války a mýty z Prologu musí být konzistentně reflektovány.
- Odpověz POUZE voláním funkce write_encyclopedia_entry.
${chronicle0Text ? `\nKRONIKA NULTÉHO ROKU (Prolog — kanonický zdroj pravdy o prehistorii):\n${chronicle0Text.substring(0, 3000)}` : ""}`;

    const userPrompt = `Napiš encyklopedický článek o: ${entityName} (${entityType})

KONTEXT:
${JSON.stringify(context || {}, null, 2)}

SOUVISEJÍCÍ UDÁLOSTI:
${eventsText || "žádné"}

FAKTA O SVĚTĚ:
${(worldMemories || []).join("\n") || "žádná"}`;

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
            name: "write_encyclopedia_entry",
            description: "Write encyclopedia article for an entity.",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "One-sentence summary in Czech" },
                description: { type: "string", description: "Full article text in Czech, multiple paragraphs" },
                imagePrompt: { type: "string", description: "English prompt for generating an illustration of this entity" },
              },
              required: ["summary", "description", "imagePrompt"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_encyclopedia_entry" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Nedostatek kreditů" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("encyclopedia-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
