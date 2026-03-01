import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-newspaper: Generate a newspaper-style report for a concluded festival.
 * Also creates a ChroWiki entry for the festival.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, festival_id } = await req.json();
    if (!session_id || !festival_id) {
      return new Response(JSON.stringify({ error: "session_id, festival_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: festival } = await sb.from("games_festivals").select("*").eq("id", festival_id).single();
    if (!festival) {
      return new Response(JSON.stringify({ error: "Festival not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already has a report?
    if (festival.newspaper_report) {
      return new Response(JSON.stringify({ article: festival.newspaper_report }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather data
    const [{ data: participants }, { data: results }, { data: disciplines }, { data: incidents }] = await Promise.all([
      sb.from("games_participants").select("*").eq("festival_id", festival_id),
      sb.from("games_results").select("*").eq("festival_id", festival_id),
      sb.from("games_disciplines").select("*"),
      sb.from("games_incidents").select("*").eq("festival_id", festival_id),
    ]);

    // Build data context
    const discMap = Object.fromEntries((disciplines || []).map((d: any) => [d.id, d]));
    const partMap = Object.fromEntries((participants || []).map((p: any) => [p.id, p]));

    // Empire medals
    const empireMedals: Record<string, { gold: number; silver: number; bronze: number }> = {};
    for (const r of (results || [])) {
      if (!r.medal) continue;
      const p = partMap[r.participant_id];
      if (!p) continue;
      if (!empireMedals[p.player_name]) empireMedals[p.player_name] = { gold: 0, silver: 0, bronze: 0 };
      if (r.medal === "gold") empireMedals[p.player_name].gold++;
      if (r.medal === "silver") empireMedals[p.player_name].silver++;
      if (r.medal === "bronze") empireMedals[p.player_name].bronze++;
    }

    // Per-discipline winners
    const discWinners: string[] = [];
    const byDisc = new Map<string, any[]>();
    for (const r of (results || [])) {
      const list = byDisc.get(r.discipline_id) || [];
      list.push(r);
      byDisc.set(r.discipline_id, list);
    }
    for (const [discId, dResults] of byDisc) {
      const disc = discMap[discId];
      const winner = dResults.sort((a: any, b: any) => (a.rank || 99) - (b.rank || 99))[0];
      const p = winner ? partMap[winner.participant_id] : null;
      if (disc && p) {
        discWinners.push(`${disc.icon_emoji} ${disc.name}: ${p.athlete_name} (${p.player_name}) — skóre ${winner.total_score?.toFixed(1)}`);
      }
    }

    const legends = (participants || []).filter((p: any) => p.is_legend);
    const dead = (participants || []).filter((p: any) => p.form === "dead");

    const topEmpire = Object.entries(empireMedals)
      .sort((a, b) => (b[1].gold * 100 + b[1].silver * 10 + b[1].bronze) - (a[1].gold * 100 + a[1].silver * 10 + a[1].bronze))[0];

    // Get world style for tone
    const { data: styleData } = await sb.from("game_style_settings")
      .select("world_vibe, writing_style").eq("session_id", session_id).maybeSingle();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not available" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Jsi novinář starověkého města. Napiš SOUHRNNÝ NOVINOVÝ ČLÁNEK o právě skončených Velkých hrách.
Styl: ${styleData?.writing_style || "kronikářský"}. Atmosféra: ${styleData?.world_vibe || "historická"}.

PRAVIDLA:
- Napiš článek v češtině jako novinový report (15-25 řádků).
- Začni dramatickým titulkem (bez markdown formátování, jen velká písmena).
- Shrň celkový průběh her — kdo dominoval, jaké byly překvapivé momenty.
- Zmín top 3-5 nejdramatičtějších momentů (highlighty).
- Zmín medailovou tabulku říší.
- Zmín legendy a padlé (pokud jsou).
- Zakonči výhledem — co to znamená pro budoucnost.
- NEPOUŽÍVEJ markdown (**, ##). Jen čistý text s odstavci.

DATA:
Festival: ${festival.name}
Hostitel: ${festival.host_player}
Rok: ${festival.announced_turn}–${festival.concluded_turn}
Účastníků: ${(participants || []).length}
Disciplín: ${(disciplines || []).length}

Medailová tabulka říší:
${Object.entries(empireMedals).sort((a, b) => (b[1].gold * 100 + b[1].silver * 10 + b[1].bronze) - (a[1].gold * 100 + a[1].silver * 10 + a[1].bronze)).map(([name, m], i) => `${i + 1}. ${name}: ${m.gold}🥇 ${m.silver}🥈 ${m.bronze}🥉`).join("\n")}

Vítězové disciplín:
${discWinners.join("\n")}

${legends.length > 0 ? `Legendy (2+ zlata): ${legends.map((l: any) => l.athlete_name).join(", ")}` : "Žádné legendy."}
${dead.length > 0 ? `Padlí v aréně: ${dead.map((d: any) => d.athlete_name).join(", ")}` : ""}
${(incidents || []).length > 0 ? `Incidenty: ${(incidents || []).map((i: any) => i.description).join("; ")}` : ""}

Celkový vítěz (nejúspěšnější říše): ${topEmpire ? `${topEmpire[0]} (${topEmpire[1].gold}🥇)` : "neznámý"}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
      }),
    });

    let article = "";
    if (aiResp.ok) {
      const aiData = await aiResp.json();
      article = aiData.choices?.[0]?.message?.content?.trim() || "";
    }

    if (!article) {
      article = `${festival.name} — ZÁVĚREČNÝ REPORT\n\nVelké hry skončily. Nejúspěšnější říší se stala ${topEmpire?.[0] || "?"} s ${topEmpire?.[1]?.gold || 0} zlatými medailemi.`;
    }

    // Save to festival
    await sb.from("games_festivals").update({ newspaper_report: article }).eq("id", festival_id);

    // Create ChroWiki entry for the festival
    const { data: existingWiki } = await sb.from("wiki_entries")
      .select("id").eq("session_id", session_id)
      .eq("entity_type", "event").eq("entity_name", festival.name).maybeSingle();

    const wikiBody = `## ${festival.name}\n\n**Rok:** ${festival.announced_turn}–${festival.concluded_turn}\n**Hostitel:** ${festival.host_player}\n**Účastníků:** ${(participants || []).length}\n\n### Medailová tabulka\n\n| Říše | 🥇 | 🥈 | 🥉 |\n|---|---|---|---|\n${Object.entries(empireMedals).sort((a, b) => (b[1].gold * 100 + b[1].silver * 10 + b[1].bronze) - (a[1].gold * 100 + a[1].silver * 10 + a[1].bronze)).map(([n, m]) => `| ${n} | ${m.gold} | ${m.silver} | ${m.bronze} |`).join("\n")}\n\n### Vítězové\n\n${discWinners.map(w => `- ${w}`).join("\n")}\n\n${legends.length > 0 ? `### Legendy\n\n${legends.map((l: any) => `- ⭐ ${l.athlete_name} (${l.player_name})`).join("\n")}\n\n` : ""}${dead.length > 0 ? `### Padlí\n\n${dead.map((d: any) => `- 💀 ${d.athlete_name}`).join("\n")}\n\n` : ""}### Novinový report\n\n${article}`;

    if (existingWiki) {
      await sb.from("wiki_entries").update({
        body_md: wikiBody, summary: article.substring(0, 200),
        last_enriched_turn: festival.concluded_turn,
      }).eq("id", existingWiki.id);
    } else {
      await sb.from("wiki_entries").insert({
        session_id, entity_type: "event", entity_id: festival_id,
        entity_name: festival.name, owner_player: festival.host_player || "",
        body_md: wikiBody, summary: article.substring(0, 200),
        last_enriched_turn: festival.concluded_turn,
      });
    }

    return new Response(JSON.stringify({ article, ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("games-newspaper error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
