import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * sphaera-feed-generate: Generates FM-style news feed items from match data.
 * Input: { session_id, round_number?, turn_number? }
 * 
 * Reads match results, player stats, injuries, deaths, standings changes
 * and generates 5-15 diverse news items. AI comments top 1-3 items.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, round_number, turn_number, season_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Load context data
    const [
      { data: matches },
      { data: teams },
      { data: players },
      { data: standings },
      { data: cities },
      { data: seasons },
      { data: associations },
    ] = await Promise.all([
      sb.from("league_matches").select("*").eq("session_id", session_id)
        .eq("status", "played")
        .order("round_number", { ascending: false }).limit(50),
      sb.from("league_teams").select("*").eq("session_id", session_id).eq("is_active", true),
      sb.from("league_players").select("*").eq("session_id", session_id),
      season_id
        ? sb.from("league_standings").select("*").eq("season_id", season_id).order("points", { ascending: false })
        : sb.from("league_standings").select("*").eq("session_id", session_id).order("points", { ascending: false }).limit(100),
      sb.from("cities").select("id, name").eq("session_id", session_id),
      sb.from("league_seasons").select("*").eq("session_id", session_id).order("season_number", { ascending: false }).limit(3),
      sb.from("sports_associations").select("*").eq("session_id", session_id),
    ]);

    if (!matches || matches.length === 0 || !teams || teams.length === 0) {
      return new Response(JSON.stringify({ ok: true, items: [], message: "No data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const teamMap = new Map((teams || []).map((t: any) => [t.id, t]));
    const cityMap = new Map((cities || []).map((c: any) => [c.id, c.name]));
    const playerMap = new Map((players || []).map((p: any) => [p.id, p]));
    const activeSeason = (seasons || [])[0];
    const targetRound = round_number || activeSeason?.current_round || 0;
    const targetTurn = turn_number || 0;

    // Get matches for this round
    const roundMatches = matches.filter((m: any) => m.round_number === targetRound);
    // Also consider recent matches if round specific ones are empty
    const recentMatches = roundMatches.length > 0 ? roundMatches : matches.slice(0, 10);

    // ═══ GENERATE NEWS ITEMS ═══
    const items: any[] = [];

    // 1. MATCH RESULTS (1 per match)
    for (const m of recentMatches.slice(0, 8)) {
      const home = teamMap.get(m.home_team_id);
      const away = teamMap.get(m.away_team_id);
      if (!home || !away) continue;
      const homeCity = cityMap.get(home.city_id);
      const awayCity = cityMap.get(away.city_id);
      const diff = Math.abs((m.home_score || 0) - (m.away_score || 0));
      const isBlowout = diff >= 15;
      const isDraw = m.home_score === m.away_score;
      const winner = (m.home_score || 0) >= (m.away_score || 0) ? home : away;
      const loser = winner === home ? away : home;
      const events: any[] = m.match_events || [];
      const knockouts = events.filter((e: any) => e.type === "knockout").length;
      const injuries = events.filter((e: any) => e.type === "injury").length;
      const deaths = events.filter((e: any) => e.type === "injury" && e.is_death);

      let headline = "";
      let body = "";
      let importance = 1;
      let icon = "⚔️";

      if (deaths.length > 0) {
        const dead = deaths[0];
        const victim = playerMap.get(dead.player_id);
        headline = `☠️ SMRT NA HŘIŠTI: ${victim?.name || "Neznámý"} padl v zápase ${home.team_name} vs ${away.team_name}`;
        body = `Tragédie v ${homeCity || "aréně"}. ${victim?.name || "Bojovník"} nepřežil střet během ${m.round_number}. kola. Zápas skončil ${m.home_score}:${m.away_score}. ${deaths.length > 1 ? `Celkem ${deaths.length} mrtvých v tomto zápase.` : ""}`;
        importance = 5;
        icon = "☠️";
        items.push({
          category: "death", headline, body, importance, icon,
          team_id: victim?.team_id, player_id: dead.player_id,
          match_id: m.id, city_id: home.city_id, city_name: homeCity,
          team_name: teamMap.get(victim?.team_id)?.team_name,
          player_name_ref: victim?.name,
        });
      }

      if (isBlowout) {
        headline = `🔥 DEMOLICE! ${winner.team_name} drtí ${loser.team_name} ${m.home_score}:${m.away_score}`;
        body = `Dominantní výkon v ${homeCity || "aréně"}. ${knockouts > 0 ? `${knockouts} vyřazení, ` : ""}${injuries > 0 ? `${injuries} zranění. ` : ""}Fanoušci ${loser.team_name} opouštěli stadion v předstihu.`;
        importance = 3;
        icon = "🔥";
      } else if (isDraw) {
        headline = `⚖️ Remíza: ${home.team_name} ${m.home_score}:${m.away_score} ${away.team_name}`;
        body = `Vyrovnaný souboj v ${homeCity || "aréně"}. Ani jeden tým nedokázal převážit misky vah.`;
        importance = 1;
        icon = "⚖️";
      } else {
        headline = `${winner.team_name} poráží ${loser.team_name} ${m.home_score}:${m.away_score}`;
        body = `${knockouts > 0 ? `${knockouts} vyřazení. ` : ""}${injuries > 0 ? `${injuries} zranění. ` : ""}Diváků: ${m.attendance || "?"}.`;
        importance = 2;
        icon = "⚔️";
      }

      items.push({
        category: "match_result", headline, body, importance, icon,
        team_id: winner.id, match_id: m.id,
        city_id: home.city_id, city_name: homeCity,
        team_name: winner.team_name,
      });
    }

    // 2. TOP SCORER NEWS
    const topScorers = [...(players || [])].filter((p: any) => (p.goals_scored || 0) > 0 && !p.is_dead)
      .sort((a: any, b: any) => (b.goals_scored || 0) - (a.goals_scored || 0));
    if (topScorers.length > 0) {
      const top = topScorers[0];
      const topTeam = teamMap.get(top.team_id);
      items.push({
        category: "top_scorer",
        headline: `🎯 ${top.name} vede tabulku střelců s ${top.goals_scored} body`,
        body: `${top.name} (${topTeam?.team_name || "?"}) je nejproduktivnějším hráčem ligy. ${top.assists ? `K tomu přidává ${top.assists} asistencí.` : ""} Forma: ${top.form}/100.`,
        importance: 2, icon: "🎯",
        team_id: top.team_id, player_id: top.id,
        team_name: topTeam?.team_name, player_name_ref: top.name,
        city_id: topTeam?.city_id, city_name: cityMap.get(topTeam?.city_id),
      });
    }

    // 3. INJURY NEWS (severe/career ending)
    const severeInjuries = (players || []).filter((p: any) =>
      !p.is_dead && p.injury_turns >= 4 && ["severe", "career_ending"].includes(p.injury_severity || "")
    );
    for (const p of severeInjuries.slice(0, 2)) {
      const pTeam = teamMap.get(p.team_id);
      items.push({
        category: "injury",
        headline: `🏥 ${p.name} mimo hru — ${p.injury_severity === "career_ending" ? "konec kariéry!" : `těžké zranění (${p.injury_turns} kol)`}`,
        body: `${pTeam?.team_name || "Tým"} přichází o klíčového ${p.position === "striker" || p.position === "attacker" ? "útočníka" : p.position === "guardian" || p.position === "defender" ? "obránce" : "hráče"}. ${p.injury_severity === "career_ending" ? "Léčitelé nedávají naději na návrat." : "Návrat se očekává za několik kol."}`,
        importance: 3, icon: "🏥",
        team_id: p.team_id, player_id: p.id,
        team_name: pTeam?.team_name, player_name_ref: p.name,
        city_id: pTeam?.city_id, city_name: cityMap.get(pTeam?.city_id),
      });
    }

    // 4. STANDINGS / LEAGUE TABLE NEWS
    const sortedStandings = [...(standings || [])].sort((a: any, b: any) => (b.points || 0) - (a.points || 0));
    if (sortedStandings.length >= 2) {
      const leader = sortedStandings[0];
      const second = sortedStandings[1];
      const leaderTeam = teamMap.get(leader.team_id);
      const gap = (leader.points || 0) - (second.points || 0);
      if (leaderTeam) {
        items.push({
          category: "standings",
          headline: `📊 ${leaderTeam.team_name} vede ligu${gap > 10 ? " s výrazným náskokem" : gap === 0 ? " — těsný souboj na čele!" : ""}`,
          body: `${leader.points} bodů po ${leader.played} zápasech. Bilance: ${leader.wins}V ${leader.draws}R ${leader.losses}P. Skóre ${leader.goals_for}:${leader.goals_against}.${gap === 0 ? ` ${teamMap.get(second.team_id)?.team_name || "Druhý tým"} má stejný počet bodů!` : ""}`,
          importance: 2, icon: "📊",
          team_id: leader.team_id, team_name: leaderTeam.team_name,
          city_id: leaderTeam.city_id, city_name: cityMap.get(leaderTeam.city_id),
        });
      }
    }

    // 5. FORM STREAKS
    for (const st of sortedStandings.slice(0, 10)) {
      const form = st.form || "";
      if (form.length >= 4) {
        const lastFour = form.slice(-4);
        const team = teamMap.get(st.team_id);
        if (lastFour === "WWWW" && team) {
          items.push({
            category: "form_streak",
            headline: `🔥 ${team.team_name} na vlně — 4 výhry v řadě!`,
            body: `Neporazitelná série pokračuje. Forma: ${form}. Trenér může být spokojen.`,
            importance: 2, icon: "🔥",
            team_id: team.id, team_name: team.team_name,
            city_id: team.city_id, city_name: cityMap.get(team.city_id),
          });
        } else if (lastFour === "LLLL" && team) {
          items.push({
            category: "form_streak",
            headline: `📉 Krize v ${team.team_name} — 4 prohry v řadě`,
            body: `Černá série pokračuje. Fanoušci žádají změnu. Forma: ${form}.`,
            importance: 2, icon: "📉",
            team_id: team.id, team_name: team.team_name,
            city_id: team.city_id, city_name: cityMap.get(team.city_id),
          });
        }
      }
    }

    // 6. TRAINING / TACTICAL CHANGES
    const tacticalTeams = (teams || []).filter((t: any) =>
      (t.training_focus && t.training_focus !== "balanced") || (t.tactical_preset && t.tactical_preset !== "balanced")
    );
    if (tacticalTeams.length > 0) {
      const t = tacticalTeams[Math.floor(Math.random() * tacticalTeams.length)];
      const focusLabels: Record<string, string> = { attack: "útočný trénink", defense: "obranný dril", tactics: "taktickou přípravu", discipline: "disciplínu" };
      const tacticLabels: Record<string, string> = { aggressive: "agresivní taktiku", defensive: "defenzivní styl", counter: "protiútoky" };
      if (t.training_focus && t.training_focus !== "balanced") {
        items.push({
          category: "training",
          headline: `📋 ${t.team_name} sází na ${focusLabels[t.training_focus] || t.training_focus}`,
          body: `Trenérský štáb ${t.team_name} přeorientoval tréninky. Výsledky se ukáží v nadcházejících zápasech.`,
          importance: 1, icon: "📋",
          team_id: t.id, team_name: t.team_name,
          city_id: t.city_id, city_name: cityMap.get(t.city_id),
        });
      }
    }

    // 7. ASSOCIATION NEWS
    for (const a of (associations || []).slice(0, 1)) {
      items.push({
        category: "association",
        headline: `🏛️ Svaz ${a.name} — reputace: ${a.reputation}`,
        body: `Skauting lv.${a.scouting_level}, mládež lv.${a.youth_development}, trénink lv.${a.training_quality}. Rozpočet: ${a.budget}.`,
        importance: 1, icon: "🏛️",
        team_name: a.name, city_id: a.city_id, city_name: cityMap.get(a.city_id),
      });
    }

    // 8. SEASON PROGRESS
    if (activeSeason) {
      const pct = Math.round((activeSeason.current_round / activeSeason.total_rounds) * 100);
      if (pct >= 75 && pct < 100) {
        items.push({
          category: "season_progress",
          headline: `📅 Liga v závěrečné fázi — ${activeSeason.current_round}/${activeSeason.total_rounds} kol odehráno`,
          body: `Blíží se konec základní části ${activeSeason.season_number}. sezóny. ${pct >= 90 ? "Playoff je na dosah!" : "Boj o playoff se vyostřuje."}`,
          importance: 2, icon: "📅",
        });
      }
    }

    // Sort by importance desc, limit to 5-15
    items.sort((a, b) => (b.importance || 0) - (a.importance || 0));
    const finalItems = items.slice(0, 15);

    // ═══ AI COMMENTS on top items ═══
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const topItems = finalItems.filter(it => it.importance >= 3).slice(0, 3);
    
    if (LOVABLE_API_KEY && topItems.length > 0) {
      try {
        const itemsText = topItems.map((it, i) => `[${i + 1}] ${it.headline}\n${it.body}`).join("\n\n");
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{
              role: "user",
              content: `Jsi kronikář starověké ligy Sphaera. Pro každou zprávu napiš krátký komentář (1-2 věty, česky, dramatický styl, jako komentátor v FM).
Zprávy:
${itemsText}

Odpověz jako JSON pole stringů, jeden komentář pro každou zprávu. POUZE JSON pole, nic jiného.`
            }],
            max_tokens: 400,
          }),
        });
        if (aiResp.ok) {
          const d = await aiResp.json();
          const text = d.choices?.[0]?.message?.content?.trim() || "";
          try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const comments = JSON.parse(jsonMatch[0]);
              for (let i = 0; i < Math.min(topItems.length, comments.length); i++) {
                topItems[i].ai_comment = comments[i];
                topItems[i].ai_comment_author = "Kronikář Sphaery";
              }
            }
          } catch { /* parse failed, skip */ }
        }
      } catch (e) { console.error("AI comment error:", e); }
    }

    // ═══ SAVE TO DB ═══
    const dbItems = finalItems.map(it => ({
      session_id,
      season_id: activeSeason?.id || null,
      round_number: targetRound,
      turn_number: targetTurn,
      category: it.category,
      headline: it.headline,
      body: it.body,
      importance: it.importance,
      icon: it.icon,
      team_id: it.team_id || null,
      player_id: it.player_id || null,
      match_id: it.match_id || null,
      city_id: it.city_id || null,
      city_name: it.city_name || null,
      team_name: it.team_name || null,
      player_name_ref: it.player_name_ref || null,
      ai_comment: it.ai_comment || null,
      ai_comment_author: it.ai_comment_author || null,
      entity_refs: it.entity_refs || [],
    }));

    if (dbItems.length > 0) {
      const { error: insertErr } = await sb.from("sphaera_feed_items").insert(dbItems);
      if (insertErr) console.error("Feed insert error:", insertErr);
    }

    // ═══ WRITE KEY EVENTS TO game_events ═══
    const keyItems = finalItems.filter(it => it.importance >= 4);
    for (const ki of keyItems) {
      await sb.from("game_events").insert({
        session_id,
        turn_number: targetTurn,
        event_type: `sphaera_${ki.category}`,
        player: ki.player_name_ref || "Sphaera",
        location: ki.city_name || null,
        note: ki.headline,
        status: "confirmed",
        mechanical_result: { sphaera: true, category: ki.category, importance: ki.importance },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      itemsGenerated: finalItems.length,
      keyEventsWritten: keyItems.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("sphaera-feed-generate error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
