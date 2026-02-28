/**
 * repair-world — Fixes broken sessions missing country, regions, AI factions.
 * 
 * Analyzes session data and creates missing structural entities:
 * 1. Country (if missing)
 * 2. Regions (if missing) — one per player + neutral
 * 3. Links orphaned provinces to regions
 * 4. AI factions (if missing)
 * 5. Wiki entries for all created entities
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Missing sessionId");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const log: string[] = [];
    const push = (msg: string) => { log.push(msg); console.log(`[repair-world] ${msg}`); };

    // Load session data
    const { data: session } = await sb.from("game_sessions").select("*").eq("id", sessionId).single();
    if (!session) throw new Error("Session not found");

    const { data: foundation } = await sb.from("world_foundations").select("*").eq("session_id", sessionId).maybeSingle();
    const worldName = foundation?.world_name || session.world_name || "Neznámý svět";

    // Load existing entities
    const { data: countries } = await sb.from("countries").select("*").eq("session_id", sessionId);
    const { data: regions } = await sb.from("regions").select("*").eq("session_id", sessionId);
    const { data: provinces } = await sb.from("provinces").select("*").eq("session_id", sessionId);
    const { data: civs } = await sb.from("civilizations").select("*").eq("session_id", sessionId);
    const { data: aiFactions } = await sb.from("ai_factions").select("*").eq("session_id", sessionId);
    const { data: cities } = await sb.from("cities").select("*").eq("session_id", sessionId);

    const humanCivs = (civs || []).filter((c: any) => !c.is_ai);
    const aiCivs = (civs || []).filter((c: any) => c.is_ai);

    // ═══ 1. Country ═══
    let countryId: string | null = countries?.[0]?.id || null;
    if (!countryId) {
      push(`Creating country: ${worldName}`);
      const { data: countryRow } = await sb.from("countries").insert({
        session_id: sessionId,
        name: worldName,
        description: foundation?.premise || `Společný stát světa ${worldName}.`,
      }).select("id").single();
      countryId = countryRow?.id || null;

      if (countryId) {
        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "country", entity_id: countryId,
          entity_name: worldName, owner_player: "system",
          summary: `${worldName} — společný stát tohoto světa.`,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "repair" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
      }
    } else {
      push(`Country already exists: ${countries![0].name}`);
    }

    // ═══ 2. Regions ═══
    const existingRegions = regions || [];
    if (existingRegions.length === 0 && humanCivs.length > 0) {
      push(`Creating regions for ${humanCivs.length} players...`);
      const regionIdMap: Record<string, string> = {};

      for (const civ of humanCivs) {
        const regionName = `${civ.civ_name} – Domovina`;
        const { data: regRow } = await sb.from("regions").insert({
          session_id: sessionId, name: regionName,
          description: `Domovský region frakce ${civ.civ_name}.`,
          biome: "plains", owner_player: civ.player_name,
          is_homeland: true, discovered_turn: 1, discovered_by: civ.player_name,
          country_id: countryId,
        }).select("id").single();

        if (regRow) {
          regionIdMap[civ.player_name] = regRow.id;
          push(`  → Region: ${regionName} (${regRow.id})`);

          await sb.from("wiki_entries").upsert({
            session_id: sessionId, entity_type: "region", entity_id: regRow.id,
            entity_name: regionName, owner_player: civ.player_name,
            summary: `${regionName} — domovský region.`,
            updated_at: new Date().toISOString(),
            references: { generated: true, mode: "repair" },
          } as any, { onConflict: "session_id,entity_type,entity_id" });
        }
      }

      // Create a neutral region
      const { data: neutralReg } = await sb.from("regions").insert({
        session_id: sessionId, name: "Neutrální území",
        description: "Neobsazené území mezi frakcemi.",
        biome: "plains", owner_player: humanCivs[0].player_name,
        is_homeland: false, discovered_turn: 1, country_id: countryId,
      }).select("id").single();
      if (neutralReg) push(`  → Neutral region: ${neutralReg.id}`);

      // ═══ 3. Link orphan provinces to regions ═══
      const orphanProvs = (provinces || []).filter((p: any) => !p.region_id);
      for (const prov of orphanProvs) {
        // Match province to player's region
        const matchedRegionId = regionIdMap[prov.owner_player] || neutralReg?.id;
        if (matchedRegionId) {
          await sb.from("provinces").update({ region_id: matchedRegionId }).eq("id", prov.id);
          push(`  → Linked province "${prov.name}" to region ${matchedRegionId}`);
        }
      }
    } else {
      push(`Regions exist: ${existingRegions.length}`);
      // Still check orphan provinces
      const orphanProvs = (provinces || []).filter((p: any) => !p.region_id);
      if (orphanProvs.length > 0) {
        push(`Fixing ${orphanProvs.length} orphan provinces...`);
        for (const prov of orphanProvs) {
          // Find a matching region by owner
          const matchRegion = existingRegions.find((r: any) => r.owner_player === prov.owner_player);
          if (matchRegion) {
            await sb.from("provinces").update({ region_id: matchRegion.id }).eq("id", prov.id);
            push(`  → Linked "${prov.name}" to region "${matchRegion.name}"`);
          }
        }
      }
    }

    // ═══ 4. AI Factions ═══
    const existingAI = aiFactions || [];
    if (existingAI.length === 0) {
      const targetAICount = Math.max(2, humanCivs.length);
      // Check if there are AI civilizations without ai_factions entries
      if (aiCivs.length > 0) {
        push(`Creating ai_factions entries for ${aiCivs.length} existing AI civs...`);
        for (const aiCiv of aiCivs) {
          const disposition: Record<string, number> = {};
          for (const hc of humanCivs) disposition[hc.player_name] = 0;
          await sb.from("ai_factions").insert({
            session_id: sessionId, faction_name: aiCiv.civ_name,
            personality: aiCiv.ai_personality || "diplomatic",
            disposition, goals: ["Přežití", "Obchod"], is_active: true,
          });
          push(`  → AI faction from civ: ${aiCiv.civ_name}`);
        }
      } else {
        // No AI civs exist at all — create them
        push(`Creating ${targetAICount} AI factions from scratch...`);
        const aiNames = ["Stínová Liga", "Severní Klan", "Pouštní Nomádi", "Železná Gilda", "Mlžný Řád"];
        const personalities = ["aggressive", "diplomatic", "mercantile", "isolationist", "expansionist"];
        for (let i = 0; i < targetAICount && i < aiNames.length; i++) {
          const disposition: Record<string, number> = {};
          for (const hc of humanCivs) disposition[hc.player_name] = 0;

          await sb.from("civilizations").insert({
            session_id: sessionId, player_name: aiNames[i],
            civ_name: aiNames[i], is_ai: true,
            ai_personality: personalities[i],
          });

          await sb.from("ai_factions").insert({
            session_id: sessionId, faction_name: aiNames[i],
            personality: personalities[i],
            disposition, goals: ["Přežití", "Expanze"], is_active: true,
          });

          // Create resources for AI
          for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
            await sb.from("player_resources").insert({
              session_id: sessionId, player_name: aiNames[i], resource_type: rt,
              income: rt === "food" ? 6 : rt === "wood" ? 4 : rt === "stone" ? 3 : rt === "iron" ? 2 : 3,
              upkeep: rt === "food" ? 3 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
              stockpile: rt === "food" ? 20 : rt === "wood" ? 10 : rt === "stone" ? 5 : rt === "iron" ? 3 : 10,
            });
          }

          await sb.from("realm_resources").insert({
            session_id: sessionId, player_name: aiNames[i],
            grain_reserve: 20, wood_reserve: 10, stone_reserve: 5, iron_reserve: 3,
            gold_reserve: 100, stability: 70, granary_capacity: 500, mobilization_rate: 0.1,
          });

          push(`  → Created AI: ${aiNames[i]} (${personalities[i]})`);
        }
      }
    } else {
      push(`AI factions exist: ${existingAI.length}`);
    }

    push(`Repair complete.`);

    return new Response(JSON.stringify({ ok: true, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("repair-world error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
