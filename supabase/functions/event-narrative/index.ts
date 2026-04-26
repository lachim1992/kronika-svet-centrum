import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    let { event, cityMemories, notes, epochStyle, worldFacts, sessionId } = body;

    // Support calling with just eventId
    if (!event && body.eventId) {
      const sb = getServiceClient();
      try {
        const { data: rows } = await sb.from("game_events").select("*").eq("id", body.eventId);
        if (rows?.length) {
          event = rows[0];
          sessionId = sessionId || event.session_id;
        }
      } catch (fetchErr) {
        console.error("Failed to fetch event by ID:", fetchErr);
      }
    }

    if (!event) {
      return jsonResponse({
        narrativeText: "Událost nebyla nalezena v databázi.",
        keyQuotes: [],
        debug: { provider: "fallback-not-found", eventId: body.eventId || null },
      });
    }

    sessionId = sessionId || event.session_id;
    if (!sessionId) {
      return jsonResponse({ narrativeText: "Chybí sessionId.", keyQuotes: [], debug: { provider: "fallback-no-session" } });
    }

    const ctx = await createAIContext(sessionId, event.turn_number);

    const notesContext = notes?.length
      ? `\nPoznámky hráčů k události:\n${notes.map((n: any) => `- ${n.author}: "${n.note_text}"`).join("\n")}`
      : "";

    const memoriesContext = cityMemories?.length
      ? `\nPaměti města:\n${cityMemories.map((m: any) => `- ${m}`).join("\n")}`
      : "";

    const factsContext = worldFacts?.length
      ? `\nFakta o světě:\n${worldFacts.map((f: any) => `- ${f}`).join("\n")}`
      : "";

    // Patch 9e: enrich node-related events with cultural/geographic context
    const NODE_EVENT_TYPES = new Set([
      "exploration", "trade_link_opened", "envoy_sent",
      "military_pressure_applied", "node_annexed",
    ]);
    let nodeFlavor = "";
    let targetNodeIds: string[] = [];
    if (NODE_EVENT_TYPES.has(event.event_type)) {
      const ref = event.reference || {};
      const sb = getServiceClient();
      const ids: string[] = [];
      if (ref.node_id) ids.push(ref.node_id);
      if (Array.isArray(ref.discovered_node_ids)) ids.push(...ref.discovered_node_ids);
      targetNodeIds = [...new Set(ids)];
      if (targetNodeIds.length > 0) {
        const { data: nodes } = await sb.from("province_nodes")
          .select("id, name, hex_q, hex_r, culture_key, profile_key, autonomy_score, node_type")
          .in("id", targetNodeIds);
        const nodeLines = (nodes || []).map((n: any) =>
          `  • ${n.name} [${n.node_type}] hex(${n.hex_q},${n.hex_r}) kultura=${n.culture_key || "?"} profil=${n.profile_key || "?"} autonomie=${n.autonomy_score ?? "?"}`
        ).join("\n");
        if (nodeLines) {
          nodeFlavor = `\nDotčené uzly:\n${nodeLines}\n\nPokyn: Vykresli atmosféru místa s ohledem na jeho kulturu a profil — místní zvyky, krajinu, hlasy obyvatel, reakci na příchod hráče "${event.player}".`;
        }
      }
    }

    const eventDesc = `Typ: ${event.event_type}, Hráč: ${event.player}, Kolo: ${event.turn_number}` +
      (event.location ? `, Místo: ${event.location}` : "") +
      (event.note ? `, Poznámka: ${event.note}` : "") +
      (event.result ? `, Výsledek: ${event.result}` : "") +
      (event.casualties ? `, Ztráty: ${event.casualties}` : "") +
      (event.treaty_type ? `, Typ smlouvy: ${event.treaty_type}` : "") +
      (event.terms_summary ? `, Podmínky: ${event.terms_summary}` : "") +
      nodeFlavor;

    const systemPrompt = `Jsi kronikář starověkého světa.

PRAVIDLA:
- NESMÍŠ vymýšlet nové události nebo výsledky.
- Narativně zpracuj POUZE data, která dostaneš.
- MUSÍŠ zahrnout poznámky hráčů — citace, kontext, perspektivu.
- Pokud existují městské paměti nebo fakta o světě, zapracuj je přirozeně do narativu.
- Výstup MUSÍ být v češtině.
- Odpověz POUZE voláním funkce generate_narrative.`;

    const result = await invokeAI(ctx, {
      systemPrompt,
      userPrompt: `Vygeneruj narativní popis této události:\n\n${eventDesc}${notesContext}${memoriesContext}${factsContext}`,
      tools: [{
        type: "function",
        function: {
          name: "generate_narrative",
          description: "Return the narrative text and optional key quotes.",
          parameters: {
            type: "object",
            properties: {
              narrativeText: { type: "string", description: "Czech narrative paragraph" },
              keyQuotes: {
                type: "array", items: { type: "string" },
                description: "Optional funny or memorable quotes from the narrative",
              },
            },
            required: ["narrativeText"],
            additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "generate_narrative" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit, zkuste to znovu za chvíli." }, 429);
      if (result.status === 402) return jsonResponse({ narrativeText: "Kronikář nemá prostředky. (AI kredity vyčerpány)", keyQuotes: [], debug: result.debug });
      return jsonResponse({ narrativeText: "Kronikář selhal...", keyQuotes: [], debug: result.debug });
    }

    const narrativeText = result.data?.narrativeText || "Kronikář selhal...";

    // Patch 9e: persist flavor narrative into the node's wiki entry
    if (targetNodeIds.length > 0 && narrativeText && narrativeText !== "Kronikář selhal...") {
      try {
        const sb = getServiceClient();
        for (const nid of targetNodeIds) {
          const { data: entry } = await sb.from("wiki_entries")
            .select("id, body_md")
            .eq("session_id", sessionId)
            .eq("entity_id", nid)
            .in("entity_type", ["neutral_node", "annexed_node"])
            .maybeSingle();
          if (entry) {
            const stamp = `\n\n---\n*Rok ${event.turn_number} — ${event.event_type}:*\n${narrativeText}`;
            const next = (entry.body_md || "").length < 6000
              ? (entry.body_md || "") + stamp
              : entry.body_md;
            await sb.from("wiki_entries").update({
              body_md: next,
              last_enriched_turn: event.turn_number,
              updated_at: new Date().toISOString(),
            }).eq("id", entry.id);
          }
        }
      } catch (e) {
        console.warn("event-narrative wiki body_md update failed:", e);
      }
    }

    return jsonResponse({
      narrativeText,
      keyQuotes: result.data?.keyQuotes || [],
      debug: result.debug,
    });
  } catch (e) {
    console.error("event-narrative error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
