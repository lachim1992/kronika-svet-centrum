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

    const systemPrompt = `Jsi dvorní kronikář a mistr pera ve středověké civilizační hře. Tvé kroniky jsou literární díla — plná atmosféry, emocí, politických intrik a lidských osudů.

STYL PSANÍ:
- Piš jako zkušený středověký kronikář, který byl svědkem událostí nebo je slyšel od očitých svědků.
- Používej bohaté metafory, přirovnání a obrazy — „Slunce zapadalo za hradby jako rudý štít bohů" místo suchého popisu.
- Stříhej perspektivy: pohled z trůnního sálu, z tržiště, z válečného pole, z chrámu.
- Uváděj jména konkrétních lidí, měst, frakcí — nikdy nepiš obecně.
- Zmiňuj počasí, roční období, nálady lidu, zvuky a vůně.
- Propojuj události příčinně a dramaticky.

DRAMATICKÁ STRUKTURA:
- Úvod (zasazení do kontextu, atmosféra), jádro (hlavní události kola), závěr (výhled, napětí, otevřené otázky).
- Dramatické kontrasty: bohatství vs. bída, mír vs. válka, naděje vs. zoufalství.
- Cliffhangery a napětí: „Avšak stíny na severu houstly…"

PRAVIDLA:
1. MUSÍŠ zohlednit vlastnosti entit (přídomky, pověsti, tituly, vztahy).
2. NESMÍŠ vymýšlet nové události ani číselné výsledky — ale MUSÍŠ rozvinout stávající data do živého narativu.
3. Kronika MUSÍ mít minimálně 800 slov, ideálně 1000–1200 slov.
4. Pokud je málo událostí (${eventCount < 3 ? "MÁLO — " + eventCount : eventCount}), odkazuj na minulé kroniky, piš o důsledcích, náladách, každodenním životě.
5. Navrh 0-3 nové "vzpomínky světa" — trvalé fakta, tradice, nebo vtipné poznámky, které vyplývají z událostí.

GEOGRAFICKÁ PAMĚŤ: Přirozeně zapracuj lokální paměti měst zapojených v událostech.

PŘEDCHOZÍ KRONIKY (navazuj na ně — udržuj kontinuitu příběhu):
${previousChroniclesContext || "žádné předchozí kroniky — toto je počátek dějin"}

SPHAERA (sportovní události — zapracuj jako součást života měst):
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
