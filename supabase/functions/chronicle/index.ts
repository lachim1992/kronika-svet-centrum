import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { events, memories, epochStyle, entityTraits, cityMemories, sessionId } = await req.json();

    if (!sessionId) {
      return jsonResponse({ chronicle: "Chybí sessionId pro generování kroniky.", suggestedMemories: [] });
    }

    const sb = getServiceClient();
    const ctx = await createAIContext(sessionId);

    // ── Load Sphaera feed items for narrative integration ──
    const { data: sphaeraFeed } = await sb
      .from("sphaera_feed_items")
      .select("headline, body, category, city_name, team_name, player_name_ref, importance")
      .eq("session_id", sessionId)
      .gte("importance", 2)
      .order("created_at", { ascending: false })
      .limit(10);

    const sphaeraContext = (sphaeraFeed || [])
      .map((f: any) => `[Sphaera/${f.category}${f.city_name ? ` @ ${f.city_name}` : ""}] ${f.headline}`)
      .join("\n");

    // ── Load last 5 chronicle entries for narrative continuity ──
    const { data: prevChronicles } = await sb
      .from("chronicle_entries")
      .select("text, turn_from, turn_to, epoch_style")
      .eq("session_id", sessionId)
      .neq("source_type", "chronicle_zero")
      .order("turn_to", { ascending: false })
      .limit(5);

    const previousChroniclesContext = (prevChronicles || [])
      .reverse()
      .map((c: any) => `[Kronika kol ${c.turn_from ?? "?"}–${c.turn_to ?? "?"}]:\n${(c.text || "").substring(0, 600)}`)
      .join("\n---\n");

    const traitsContext = (entityTraits || [])
      .filter((t: any) => t.is_active)
      .map((t: any) => `${t.entity_name} (${t.entity_type}): [${t.trait_category}] ${t.trait_text}`)
      .join("\n");

    const cityMemoriesContext = (cityMemories || [])
      .map((m: any) => `[${m.cityName || "?"}] (${m.category || "tradition"}): ${m.text}`)
      .join("\n");

    const eventCount = (events || []).length;

    const systemPrompt = `Jsi kronikář civilizační deskové hry.

Tvým úkolem je:
1. Převést potvrzené herní události do narativního textu kroniky (česky).
2. Navrhnout 0-3 nové "vzpomínky světa" — trvalé fakty, tradice, nebo vtipné poznámky, které vyplývají z událostí.

DŮLEŽITÉ: Při psaní kroniky MUSÍŠ zohlednit zaznamenané vlastnosti entit (přídomky, pověsti, tituly, vztahy).
Používej přídomky a tituly vládců, zmiňuj pověsti měst, reflektuj zaznamenané vztahy mezi entitami.

GEOGRAFICKÁ PAMĚŤ: Musíš přirozeně zapracovat lokální paměti měst, která jsou zapojena v událostech kola.

DÉLKA A HLOUBKA:
- Kronika MUSÍ mít minimálně 800 slov, ideálně 1000-1200 slov.
- Piš rozsáhle, s atmosférickými popisy (nálady lidu, krajiny, obchodního ruchu, počasí, slavností).
- NESMÍŠ vymýšlet nové události ani fakta — ale MUSÍŠ rozvinout stávající události do bohatého narativu.
- Pokud je v aktuálním kole málo událostí (${eventCount < 3 ? "MÁLO UDÁLOSTÍ — " + eventCount : eventCount + " událostí"}), MUSÍŠ zasadit události do kontextu předchozích kronik.
  - Odkazuj na minulé události, porovnávej s předchozími koly, uváděj dlouhodobé trendy.
  - Piš o tom, jak lid vzpomíná na nedávné události, jak se mění nálada ve městech, jak se vyvíjí politická situace.
  - Zmiňuj důsledky minulých rozhodnutí a jejich dopad na současnost.
- Atmosférické pasáže (popisy nálad, prostředí, obchodního ruchu) jsou žádoucí, ale NESMÍ obsahovat nové informace — pouze rozvíjej to, co je doloženo daty.

PŘEDCHOZÍ KRONIKY (kontext pro navázání a zasazení do dějin):
${previousChroniclesContext || "žádné předchozí kroniky"}

SPHAERA (sportovní události — zapracuj přirozeně jako součást života měst, pokud jsou k dispozici):
${sphaeraContext || "žádné sportovní události"}

Odpověz POUZE voláním funkce write_chronicle.`;

    const userContent = `Potvrzené události:\n${JSON.stringify(events, null, 2)}\n\nExistující paměť světa:\n${JSON.stringify(memories, null, 2)}\n\nLokální paměti měst:\n${cityMemoriesContext || "žádné"}\n\nVlastnosti entit:\n${traitsContext || "žádné"}`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: userContent,
      tools: [{
        type: "function",
        function: {
          name: "write_chronicle",
          description: "Write chronicle text and suggest world memories",
          parameters: {
            type: "object",
            properties: {
              chronicle: { type: "string", description: "Chronicle narrative text in Czech, minimum 800 words" },
              suggestedMemories: {
                type: "array",
                items: { type: "string" },
                description: "Suggested world memory facts in Czech"
              }
            },
            required: ["chronicle", "suggestedMemories"],
            additionalProperties: false
          }
        }
      }],
      toolChoice: { type: "function", function: { name: "write_chronicle" } },
      maxTokens: 4096,
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Příliš mnoho požadavků, zkuste to později." }, 429);
      if (result.status === 402) return jsonResponse({ error: "Kredit vyčerpán." }, 402);
      return jsonResponse({
        chronicle: "Kronikář selhal... zkuste to znovu.",
        suggestedMemories: [],
        debug: result.debug,
      });
    }

    return jsonResponse({ ...result.data, debug: result.debug });
  } catch (e) {
    console.error("chronicle error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
