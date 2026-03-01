import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-announce: Announce Olympic Games or create a local festival.
 *
 * For Olympics (is_global=true):
 *   - Auto-selects host city based on cultural influence + prestige
 *   - Creates announcement event → nomination phase starts
 *   - Auto-generates athletes for each faction
 *
 * For Local festivals:
 *   - Player chooses city and festival type
 *   - Immediate effects (morale boost, resource cost)
 *
 * Input: { session_id, player_name, type: "olympic" | "local_*", city_id?, turn_number }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, player_name, type, city_id, turn_number } = await req.json();

    if (!session_id || !player_name || !type) {
      return new Response(JSON.stringify({ error: "session_id, player_name, type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const currentTurn = turn_number || 1;
    const isGlobal = type === "olympic";

    // ═══════════════════════════════════════════
    // OLYMPIC GAMES → Start CANDIDACY phase
    // ═══════════════════════════════════════════
    if (isGlobal) {
      // Check if games already active
      const { data: activeGames } = await sb.from("games_festivals")
        .select("id").eq("session_id", session_id)
        .in("status", ["candidacy", "announced", "nomination", "qualifying", "finals"]);

      if (activeGames && activeGames.length > 0) {
        return new Response(JSON.stringify({ error: "Hry již probíhají", existing: activeGames[0].id }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create the festival in CANDIDACY phase — no host yet
      const { data: festival, error: festErr } = await sb.from("games_festivals").insert({
        session_id,
        festival_type: "olympic",
        name: `Velké hry — rok ${currentTurn}`,
        host_city_id: null,
        host_player: null,
        status: "candidacy",
        announced_turn: currentTurn,
        candidacy_deadline_turn: currentTurn + 1,
        is_global: true,
        prestige_pool: 50,
        host_selection_method: "candidacy",
      }).select("*").single();

      if (festErr) throw festErr;

      // Create game event
      await sb.from("game_events").insert({
        session_id,
        event_type: "games_candidacy_open",
        note: `Velké hry byly vyhlášeny! Města mohou podávat kandidatury na pořadatelství. Uzávěrka v roce ${currentTurn + 1}.`,
        player: player_name,
        turn_number: currentTurn,
        confirmed: true,
        reference: {
          festival_id: festival.id,
          candidacy_deadline: currentTurn + 1,
        },
      });

      return new Response(JSON.stringify({
        ok: true,
        festival,
        phase: "candidacy",
        deadline_turn: currentTurn + 1,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════
    // LOCAL FESTIVAL — Rich instant resolve
    // ═══════════════════════════════════════════
    if (!city_id) {
      return new Response(JSON.stringify({ error: "city_id required for local festival" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: city } = await sb.from("cities")
      .select("id, name, owner_player, city_stability, population_total, local_renown, development_level, influence_score")
      .eq("id", city_id).eq("session_id", session_id).single();

    if (!city || city.owner_player !== player_name) {
      return new Response(JSON.stringify({ error: "Město nenalezeno nebo vám nepatří" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Festival config per type ───
    const FESTIVAL_CONFIG: Record<string, {
      gold: number; stability_boost: number; prestige_type: string; prestige_amount: number;
      requires_arena: boolean; requires_military: boolean;
      renown_boost: number; extra_effects: string;
    }> = {
      local_gladiator: {
        gold: 30, stability_boost: 5, prestige_type: "military_prestige", prestige_amount: 8,
        requires_arena: true, requires_military: false,
        renown_boost: 5, extra_effects: "gladiator_fights",
      },
      local_harvest: {
        gold: 15, stability_boost: 8, prestige_type: "economic_prestige", prestige_amount: 5,
        requires_arena: false, requires_military: false,
        renown_boost: 3, extra_effects: "grain_boost",
      },
      local_tournament: {
        gold: 25, stability_boost: 3, prestige_type: "military_prestige", prestige_amount: 6,
        requires_arena: false, requires_military: true,
        renown_boost: 4, extra_effects: "military_morale",
      },
      local_academic: {
        gold: 20, stability_boost: 10, prestige_type: "cultural_prestige", prestige_amount: 7,
        requires_arena: false, requires_military: false,
        renown_boost: 4, extra_effects: "academy_boost",
      },
      local_religious: {
        gold: 10, stability_boost: 15, prestige_type: "cultural_prestige", prestige_amount: 3,
        requires_arena: false, requires_military: false,
        renown_boost: 2, extra_effects: "legitimacy_boost",
      },
    };

    const cfg = FESTIVAL_CONFIG[type] || FESTIVAL_CONFIG.local_harvest;

    // ─── Prerequisite checks ───
    if (cfg.requires_arena) {
      const { data: arena } = await sb.from("city_buildings")
        .select("id, name, current_level").eq("city_id", city_id).eq("session_id", session_id)
        .eq("status", "completed").eq("is_arena", true).maybeSingle();
      if (!arena) {
        return new Response(JSON.stringify({ error: "Gladiátorské hry vyžadují postavenou arénu!" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (cfg.requires_military) {
      const { data: stacks } = await sb.from("military_stacks")
        .select("id").eq("session_id", session_id).eq("owner_player", player_name).limit(1);
      if (!stacks || stacks.length === 0) {
        return new Response(JSON.stringify({ error: "Rytířský turnaj vyžaduje alespoň jednu vojenskou jednotku!" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── Gold check & deduct ───
    const { data: res } = await sb.from("realm_resources")
      .select("gold_reserve, military_prestige, economic_prestige, cultural_prestige, prestige")
      .eq("session_id", session_id).eq("player_name", player_name).single();

    if (!res || (res as any).gold_reserve < cfg.gold) {
      return new Response(JSON.stringify({ error: `Nedostatek zlata. Potřeba: ${cfg.gold}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const goldUpdate: any = { gold_reserve: (res as any).gold_reserve - cfg.gold };
    goldUpdate[cfg.prestige_type] = ((res as any)[cfg.prestige_type] || 0) + cfg.prestige_amount;
    goldUpdate.prestige = ((res as any).prestige || 0) + Math.floor(cfg.prestige_amount / 2);
    await sb.from("realm_resources").update(goldUpdate).eq("session_id", session_id).eq("player_name", player_name);

    // ─── Apply city effects ───
    await sb.from("cities").update({
      city_stability: Math.min(100, city.city_stability + cfg.stability_boost),
      local_renown: (city.local_renown || 0) + cfg.renown_boost,
    }).eq("id", city_id);

    // ═══ TYPE-SPECIFIC RICH RESOLVE ═══
    const festivalResults: any = { type, events: [], highlights: [], deaths: [], champions: [] };

    // ─── GLADIATOR: Actual fights from academy students ───
    if (cfg.extra_effects === "gladiator_fights") {
      const { data: gladStudents } = await sb.from("academy_students")
        .select("id, name, strength, endurance, agility, tactics, charisma, traits, academy_id, portrait_url")
        .eq("session_id", session_id).eq("player_name", player_name)
        .in("status", ["graduated", "active"])
        .order("strength", { ascending: false }).limit(8);

      const fighters = gladStudents || [];
      if (fighters.length >= 2) {
        // Run pairwise duels
        const duels: any[] = [];
        for (let i = 0; i < fighters.length - 1; i += 2) {
          const a = fighters[i], b = fighters[i + 1];
          const scoreA = a.strength * 0.4 + a.agility * 0.3 + a.tactics * 0.2 + a.endurance * 0.1 + Math.random() * 20;
          const scoreB = b.strength * 0.4 + b.agility * 0.3 + b.tactics * 0.2 + b.endurance * 0.1 + Math.random() * 20;
          const winner = scoreA >= scoreB ? a : b;
          const loser = scoreA >= scoreB ? b : a;
          const isDeath = Math.random() < 0.08;
          const isInjury = !isDeath && Math.random() < 0.15;

          duels.push({
            winner: winner.name, loser: loser.name,
            winner_score: Math.round(Math.max(scoreA, scoreB) * 10) / 10,
            loser_score: Math.round(Math.min(scoreA, scoreB) * 10) / 10,
            death: isDeath, injury: isInjury,
          });

          // Upsert gladiator_records for winner
          const { data: existingW } = await sb.from("gladiator_records")
            .select("id, fights, victories, kills, crowd_favor")
            .eq("session_id", session_id).eq("student_id", winner.id).maybeSingle();

          if (existingW) {
            await sb.from("gladiator_records").update({
              fights: existingW.fights + 1, victories: existingW.victories + 1,
              kills: isDeath ? existingW.kills + 1 : existingW.kills,
              crowd_favor: Math.min(100, existingW.crowd_favor + 5),
            }).eq("id", existingW.id);
          } else {
            await sb.from("gladiator_records").insert({
              session_id, student_id: winner.id, academy_id: winner.academy_id,
              fights: 1, victories: 1, kills: isDeath ? 1 : 0,
              crowd_favor: 30, status: "active",
            });
          }

          // Upsert gladiator_records for loser
          const { data: existingL } = await sb.from("gladiator_records")
            .select("id, fights, victories, injuries, crowd_favor")
            .eq("session_id", session_id).eq("student_id", loser.id).maybeSingle();

          if (isDeath) {
            if (existingL) {
              await sb.from("gladiator_records").update({
                fights: existingL.fights + 1, status: "dead",
                died_turn: currentTurn, cause_of_death: `Padl v souboji proti ${winner.name}`,
              }).eq("id", existingL.id);
            } else {
              await sb.from("gladiator_records").insert({
                session_id, student_id: loser.id, academy_id: loser.academy_id,
                fights: 1, status: "dead", died_turn: currentTurn,
                cause_of_death: `Padl v souboji proti ${winner.name}`,
              });
            }
            // Mark student as dead
            await sb.from("academy_students").update({ status: "dead" }).eq("id", loser.id);
            festivalResults.deaths.push({ name: loser.name, killedBy: winner.name });

            // Update academy fatalities
            await sb.from("academies").update({
              total_fatalities: (await sb.from("academies").select("total_fatalities").eq("id", loser.academy_id).single()).data?.total_fatalities + 1 || 1,
            }).eq("id", loser.academy_id);
          } else if (isInjury) {
            if (existingL) {
              await sb.from("gladiator_records").update({
                fights: existingL.fights + 1,
                injuries: (existingL.injuries || 0) + 1,
              }).eq("id", existingL.id);
            } else {
              await sb.from("gladiator_records").insert({
                session_id, student_id: loser.id, academy_id: loser.academy_id,
                fights: 1, injuries: 1, crowd_favor: 15, status: "active",
              });
            }
          } else {
            if (existingL) {
              await sb.from("gladiator_records").update({ fights: existingL.fights + 1 }).eq("id", existingL.id);
            } else {
              await sb.from("gladiator_records").insert({
                session_id, student_id: loser.id, academy_id: loser.academy_id,
                fights: 1, crowd_favor: 15, status: "active",
              });
            }
          }
        }

        // Determine champion (fighter with most wins in duels)
        const winCounts: Record<string, number> = {};
        for (const d of duels) winCounts[d.winner] = (winCounts[d.winner] || 0) + 1;
        const champion = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (champion) festivalResults.champions.push(champion);

        festivalResults.events = duels;
        festivalResults.highlights.push(`${duels.length} soubojů odehráno. Šampion: ${champion || "nerozhodně"}.`);
        if (festivalResults.deaths.length > 0) {
          festivalResults.highlights.push(`💀 ${festivalResults.deaths.length} gladiátorů padlo.`);
        }

        // Check gladiator Hall of Fame — 5+ wins or 3+ kills
        const { data: fameRecords } = await sb.from("gladiator_records")
          .select("student_id, victories, kills, academy_id")
          .eq("session_id", session_id)
          .or("victories.gte.5,kills.gte.3");

        for (const fr of (fameRecords || [])) {
          const { data: student } = await sb.from("academy_students")
            .select("id, name, portrait_url, bio").eq("id", fr.student_id).maybeSingle();
          if (!student) continue;

          // Check if wiki entry already exists
          const { count } = await sb.from("wiki_entries")
            .select("id", { count: "exact", head: true })
            .eq("entity_id", fr.student_id).eq("entity_type", "hero");
          if (count && count > 0) continue;

          await sb.from("wiki_entries").insert({
            session_id, entity_type: "hero", entity_id: fr.student_id,
            entity_name: student.name, owner_player: player_name,
            summary: `Slavný gladiátor s ${fr.victories} výhrami a ${fr.kills} zabití. ${student.bio || ""}`,
            image_url: student.portrait_url,
          });
          festivalResults.highlights.push(`⭐ ${student.name} zapsán do Síně slávy gladiátorů!`);
        }
      } else {
        festivalResults.highlights.push("Nedostatek bojovníků pro gladiátorské zápasy.");
      }
    }

    // ─── HARVEST: Grain production boost ───
    if (cfg.extra_effects === "grain_boost") {
      // +25% grain production for 2 turns via a city tag or direct stat boost
      await sb.from("cities").update({
        local_grain_reserve: Math.round((city as any).local_grain_reserve * 1.25 + 50),
        famine_severity: 0, famine_turn: false,
      }).eq("id", city_id);
      festivalResults.highlights.push(`🌾 Zásoby obilí posíleny o 25%. Hladomor zažehnán.`);
      festivalResults.highlights.push(`Stabilita města +${cfg.stability_boost}. Rolníci slaví.`);
    }

    // ─── TOURNAMENT: Military prestige + morale ───
    if (cfg.extra_effects === "military_morale") {
      const { data: stacks } = await sb.from("military_stacks")
        .select("id, morale, experience")
        .eq("session_id", session_id).eq("owner_player", player_name);

      let boosted = 0;
      for (const s of (stacks || [])) {
        await sb.from("military_stacks").update({
          morale: Math.min(100, (s.morale || 50) + 10),
          experience: (s.experience || 0) + 5,
        }).eq("id", s.id);
        boosted++;
      }
      // Boost city legitimacy
      await sb.from("cities").update({
        legitimacy: Math.min(100, (city as any).legitimacy + 5),
      }).eq("id", city_id);

      festivalResults.highlights.push(`⚔️ ${boosted} jednotek získalo +10 morálky a +5 zkušeností.`);
      festivalResults.highlights.push(`Legitimita města +5.`);

      // Find champion unit
      if (stacks && stacks.length > 0) {
        const best = stacks.sort((a, b) => (b.experience || 0) - (a.experience || 0))[0];
        festivalResults.champions.push(`Nejzkušenější jednotka: ID ${best.id}`);
      }
    }

    // ─── ACADEMIC: Academy reputation boost ───
    if (cfg.extra_effects === "academy_boost") {
      const { data: acads } = await sb.from("academies")
        .select("id, name, reputation, trainer_level")
        .eq("session_id", session_id).eq("player_name", player_name).eq("status", "active");

      for (const a of (acads || [])) {
        await sb.from("academies").update({
          reputation: Math.min(100, a.reputation + 8),
          trainer_level: a.trainer_level + 1,
        }).eq("id", a.id);
      }
      festivalResults.highlights.push(`📚 ${(acads || []).length} akademií získalo +8 reputace a +1 úroveň trenéra.`);
    }

    // ─── RELIGIOUS: Legitimacy boost ───
    if (cfg.extra_effects === "legitimacy_boost") {
      await sb.from("cities").update({
        legitimacy: Math.min(100, (city as any).legitimacy + 10),
      }).eq("id", city_id);
      festivalResults.highlights.push(`🙏 Legitimita města +10. Stabilita +${cfg.stability_boost}.`);
    }

    // ═══ Create festival record ═══
    const festivalNames: Record<string, string> = {
      local_gladiator: `Gladiátorské hry v ${city.name}`,
      local_harvest: `Slavnosti sklizně v ${city.name}`,
      local_tournament: `Rytířský turnaj v ${city.name}`,
      local_academic: `Akademická soutěž v ${city.name}`,
      local_religious: `Náboženský festival v ${city.name}`,
    };

    const { data: festival } = await sb.from("games_festivals").insert({
      session_id,
      festival_type: type,
      name: festivalNames[type] || `Festival v ${city.name}`,
      host_city_id: city_id,
      host_player: player_name,
      status: "concluded",
      announced_turn: currentTurn,
      concluded_turn: currentTurn,
      is_global: false,
      total_investment_gold: cfg.gold,
      effects_applied: true,
      festival_results: festivalResults,
    }).select("*").single();

    // ═══ Game event with rich data ═══
    const hasDeaths = festivalResults.deaths && festivalResults.deaths.length > 0;
    const isSignificant = hasDeaths || festivalResults.champions.length > 0;

    await sb.from("game_events").insert({
      session_id,
      event_type: hasDeaths ? "festival_with_death" : "local_festival",
      note: `${festivalNames[type] || "Festival"}: ${festivalResults.highlights.join(" ")}`,
      player: player_name,
      turn_number: currentTurn,
      confirmed: true,
      reference: {
        festival_id: festival?.id,
        city_name: city.name,
        type, gold_cost: cfg.gold,
        prestige_type: cfg.prestige_type,
        prestige_gained: cfg.prestige_amount,
        stability_boost: cfg.stability_boost,
        results: festivalResults,
      },
    });

    // ═══ Chronicle entry for significant events (deaths, records) ═══
    if (isSignificant) {
      await sb.from("chronicle_entries").insert({
        session_id,
        text: `${festivalNames[type]}: ${festivalResults.highlights.join(" ")}`,
        source_type: "system",
        turn_from: currentTurn, turn_to: currentTurn,
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      festival,
      results: festivalResults,
      prestige: { type: cfg.prestige_type, gained: cfg.prestige_amount },
      city: city.name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("games-announce error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
