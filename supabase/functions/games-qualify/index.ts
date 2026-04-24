import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * games-qualify: Run national qualification for a player's academy graduates.
 *
 * Takes all "graduated" students for a player, simulates them competing
 * in the same disciplines as Olympics, returns ranked results.
 * Player then selects 3 to send to the Olympics.
 *
 * Actions:
 *   action: "simulate" — run qualification, return results
 *   action: "select"  — player picks 3 student_ids, creates games_participants
 *
 * Input: { session_id, player_name, festival_id, action, selected_student_ids? }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, player_name, festival_id, action, selected_student_ids } = await req.json();

    if (!session_id || !player_name || !festival_id || !action) {
      return new Response(JSON.stringify({ error: "session_id, player_name, festival_id, action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify festival exists and is in nomination phase
    const { data: festival } = await sb.from("games_festivals")
      .select("*").eq("id", festival_id).single();

    if (!festival) {
      return new Response(JSON.stringify({ error: "Festival nenalezen" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["nomination", "candidacy"].includes(festival.status)) {
      return new Response(JSON.stringify({ error: "Festival není ve fázi nominace" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════
    // ACTION: SIMULATE — run national qualification
    // ═══════════════════════════════════════════
    if (action === "simulate") {
      // Check if already simulated
      const { count: existingCount } = await sb.from("games_qualifications")
        .select("id", { count: "exact", head: true })
        .eq("festival_id", festival_id).eq("player_name", player_name);

      if (existingCount && existingCount > 0) {
        // Reconstruct enriched results from saved qualification data
        const { data: qualRows } = await sb.from("games_qualifications")
          .select("*").eq("festival_id", festival_id).eq("player_name", player_name);

        // Get unique student IDs
        const studentIds = [...new Set((qualRows || []).map(q => q.student_id))];
        const { data: studentsData } = await sb.from("academy_students")
          .select("*, academies!inner(name)")
          .in("id", studentIds);

        const studentMap = new Map((studentsData || []).map(s => [s.id, s]));

        // Aggregate per student
        const studentAgg: Record<string, { rank: number; totalScore: number; disciplines: any[] }> = {};
        for (const q of (qualRows || [])) {
          if (!studentAgg[q.student_id]) {
            studentAgg[q.student_id] = { rank: q.rank, totalScore: 0, disciplines: [] };
          }
          studentAgg[q.student_id].totalScore += q.score || 0;
          studentAgg[q.student_id].disciplines.push({
            discipline_key: q.discipline_key,
            discipline_name: q.discipline_key,
            score: q.score || 0,
          });
        }

        const results = Object.entries(studentAgg)
          .sort((a, b) => b[1].totalScore - a[1].totalScore)
          .map(([sid, agg], idx) => {
            const s = studentMap.get(sid);
            return {
              rank: idx + 1,
              student_id: sid,
              student_name: s?.name || "?",
              academy_name: (s as any)?.academies?.name || "?",
              specialty: s?.specialty || "",
              traits: s?.traits || [],
              strength: s?.strength || 0,
              endurance: s?.endurance || 0,
              agility: s?.agility || 0,
              tactics: s?.tactics || 0,
              charisma: s?.charisma || 0,
              portrait_url: s?.portrait_url || null,
              bio: s?.bio || null,
              totalScore: Math.round(agg.totalScore * 100) / 100,
              disciplines: agg.disciplines,
            };
          });

        return new Response(JSON.stringify({ ok: true, results, already_simulated: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get all graduated or promoted students for this player (promoted = previously nominated, still eligible)
      const { data: graduates } = await sb.from("academy_students")
        .select("*, academies!inner(name, profile_athletics, profile_combat, profile_culture, profile_strategy, infrastructure, trainer_level, nutrition)")
        .eq("session_id", session_id)
        .eq("player_name", player_name)
        .in("status", ["graduated", "promoted"]);

      if (!graduates || graduates.length === 0) {
        return new Response(JSON.stringify({ error: "Žádní absolventi k dispozici. Nejprve potřebujete akademie s absolventy." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get disciplines
      const { data: disciplines } = await sb.from("games_disciplines").select("*");
      if (!disciplines || disciplines.length === 0) {
        return new Response(JSON.stringify({ error: "Žádné disciplíny" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Simulate each student across all disciplines
      const studentScores: Map<string, { totalScore: number; results: any[] }> = new Map();

      for (const student of graduates) {
        const discResults: any[] = [];
        let totalScore = 0;

        for (const disc of disciplines) {
          const primaryVal = (student as any)[disc.primary_stat] || 50;
          const secondaryVal = disc.secondary_stat ? (student as any)[disc.secondary_stat] || 50 : 50;
          const allStats = [student.strength, student.endurance, student.agility, student.tactics, student.charisma];
          const avgStat = allStats.reduce((a: number, b: number) => a + b, 0) / allStats.length;

          const baseScore = primaryVal * 0.6 + secondaryVal * 0.25 + avgStat * 0.15;

          // Academy quality bonus
          const acad = (student as any).academies;
          const qualityBonus = acad
            ? (acad.infrastructure * 0.15 + acad.trainer_level * 0.15 + acad.nutrition * 0.1)
            : 0;

          // Trait bonuses
          let traitBonus = 0;
          const traits = student.traits || [];
          if (traits.includes("Železný")) traitBonus += 5;
          if (traits.includes("Křehký")) traitBonus -= 3;
          if (traits.includes("Charismatický") && disc.category === "cultural") traitBonus += 8;
          if (traits.includes("Odvážný") && disc.category === "physical") traitBonus += 5;
          if (traits.includes("Stoický") && disc.category === "strategic") traitBonus += 6;

          // Random variance ±15%
          const variance = (Math.random() - 0.5) * 2 * baseScore * 0.15;

          const score = Math.round((baseScore + qualityBonus + traitBonus + variance) * 100) / 100;
          totalScore += score;

          discResults.push({
            discipline_key: disc.key,
            discipline_name: disc.name,
            score,
          });
        }

        studentScores.set(student.id, { totalScore: Math.round(totalScore * 100) / 100, results: discResults });
      }

      // Rank students by total score
      const ranked = graduates
        .map(s => ({
          student: s,
          totalScore: studentScores.get(s.id)?.totalScore || 0,
          results: studentScores.get(s.id)?.results || [],
        }))
        .sort((a, b) => b.totalScore - a.totalScore);

      // Save qualification results
      const insertRows: any[] = [];
      for (let i = 0; i < ranked.length; i++) {
        const r = ranked[i];
        for (const dr of r.results) {
          insertRows.push({
            session_id,
            festival_id,
            player_name,
            student_id: r.student.id,
            discipline_key: dr.discipline_key,
            score: dr.score,
            rank: i + 1,
            selected: false,
          });
        }
      }

      await sb.from("games_qualifications").insert(insertRows);

      // Return ranked results with student info
      const response = ranked.map((r, idx) => ({
        rank: idx + 1,
        student_id: r.student.id,
        student_name: r.student.name,
        academy_name: (r.student as any).academies?.name || "?",
        specialty: r.student.specialty,
        traits: r.student.traits,
        strength: r.student.strength,
        endurance: r.student.endurance,
        agility: r.student.agility,
        tactics: r.student.tactics,
        charisma: r.student.charisma,
        portrait_url: r.student.portrait_url,
        bio: r.student.bio,
        totalScore: r.totalScore,
        disciplines: r.results,
      }));

      return new Response(JSON.stringify({ ok: true, results: response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════
    // ACTION: SELECT — player picks 3 athletes
    // ═══════════════════════════════════════════
    if (action === "select") {
      if (!selected_student_ids || !Array.isArray(selected_student_ids) || selected_student_ids.length === 0) {
        return new Response(JSON.stringify({ error: "selected_student_ids required (array of student IDs)" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (selected_student_ids.length > 3) {
        return new Response(JSON.stringify({ error: "Maximálně 3 zástupci" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete old participants if re-nominating (allow overwrite while in nomination phase)
      const { data: oldParticipants } = await sb.from("games_participants")
        .select("id, student_id")
        .eq("festival_id", festival_id).eq("player_name", player_name);

      if (oldParticipants && oldParticipants.length > 0) {
        // Revert old students back to graduated
        const oldStudentIds = oldParticipants.map(p => p.student_id).filter(Boolean);
        if (oldStudentIds.length > 0) {
          await sb.from("academy_students").update({ status: "graduated" }).in("id", oldStudentIds);
        }
        await sb.from("games_participants")
          .delete().eq("festival_id", festival_id).eq("player_name", player_name);
      }

      // Get selected students
      const { data: students } = await sb.from("academy_students")
        .select("*")
        .in("id", selected_student_ids)
        .eq("session_id", session_id)
        .eq("player_name", player_name)
        .eq("status", "graduated");

      if (!students || students.length === 0) {
        return new Response(JSON.stringify({ error: "Vybraní studenti nenalezeni" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get city + civ context
      const { data: fCities } = await sb.from("cities")
        .select("id, development_level").eq("session_id", session_id).eq("owner_player", player_name).limit(1);
      const bestCity = fCities?.[0];
      const infraBonus = bestCity ? bestCity.development_level * 2 : 0;

      const { data: civId } = await sb.from("civ_identity")
        .select("morale_modifier").eq("session_id", session_id).eq("player_name", player_name).maybeSingle();
      const civMod = civId?.morale_modifier || 0;

      // Create participants
      for (const student of students) {
        await sb.from("games_participants").insert({
          session_id,
          festival_id,
          player_name,
          city_id: bestCity?.id || null,
          athlete_name: student.name,
          student_id: student.id,
          strength: student.strength,
          endurance: student.endurance,
          agility: student.agility,
          tactics: student.tactics,
          charisma: student.charisma,
          training_bonus: infraBonus + 10,
          city_infrastructure_bonus: infraBonus,
          civ_modifier: civMod * 10,
          traits: student.traits || [],
          form: "peak",
          background: student.bio,
        });

        // Mark student as promoted
        await sb.from("academy_students").update({ status: "promoted" }).eq("id", student.id);
      }

      // Mark selected in qualifications
      await sb.from("games_qualifications")
        .update({ selected: true })
        .eq("festival_id", festival_id)
        .eq("player_name", player_name)
        .in("student_id", selected_student_ids);

      // Game event
      await sb.from("game_events").insert({
        session_id,
        event_type: "national_team_selected",
        note: `${player_name} nominoval ${students.length} atletů na Velké hry: ${students.map(s => s.name).join(", ")}.`,
        player: player_name,
        turn_number: festival.announced_turn,
        confirmed: true,
        reference: {
          festival_id,
          athletes: students.map(s => ({ id: s.id, name: s.name, specialty: s.specialty })),
        },
      });

      return new Response(JSON.stringify({
        ok: true,
        selected: students.map(s => ({ id: s.id, name: s.name, specialty: s.specialty })),
        count: students.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("games-qualify error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
