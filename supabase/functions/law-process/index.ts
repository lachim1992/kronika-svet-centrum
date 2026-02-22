const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lawName, fullText, effects, playerName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ epicText: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const effectDescriptions = (effects || []).map((e: any) => {
      const labels: Record<string, string> = {
        tax_change: "změna daní",
        trade_restriction: "obchodní omezení",
        military_funding: "vojenské financování",
        civil_reform: "občanská reforma",
      };
      return `${labels[e.type] || e.type} (síla: ${e.value})`;
    }).join(", ");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Jsi královský písař ve fantasy civilizační hře. Tvým úkolem je přepsat zákon do epického, středověkého znění.

Pravidla:
- Zachovej všechny mechanické efekty zákona
- Přepiš do slavnostního, královského stylu
- Max 3 věty
- Nikdy nevymýšlej nové efekty
- Odpověz pouze přepsaným textem, bez vysvětlení`,
          },
          {
            role: "user",
            content: `Vládce: ${playerName}
Název zákona: ${lawName}
Původní text: ${fullText}
Efekty: ${effectDescriptions}

Přepiš zákon do epického znění:`,
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ epicText: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const epicText = data.choices?.[0]?.message?.content?.trim() || null;

    return new Response(JSON.stringify({ epicText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("law-process error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
