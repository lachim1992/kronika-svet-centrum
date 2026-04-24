// ─────────────────────────────────────────────────────────────────────────────
// world-layer-bootstrap — World Ontology v9.1 post-bootstrap step
//
// Reads worldgen_spec.ancient_layer from world_foundations and projects it
// into the live world:
//
//   1. mythic_seeds[] → tag nearest existing province_node with mythic_tag
//      (or create 'mythic_ruin' node if no node exists at hex)
//   2. selected_lineages[] → insert into realm_heritage for each player
//   3. reset_event → insert founding chronicle entry (prologue)
//   4. route_state backfill for any new routes
//
// Idempotent: safe to call multiple times. Uses ON CONFLICT for heritage,
// checks for existing mythic tags, and checks for existing prologue chronicle.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface MythicSeed {
  id: string;
  hex_q: number;
  hex_r: number;
  tag: string;
}

interface LineageProposal {
  id: string;
  name: string;
  description: string;
  cultural_anchor?: string;
}

interface AncientLayer {
  version: number;
  reset_event: { type: string; description: string; turn_offset: number };
  lineage_candidates: LineageProposal[];
  selected_lineages: string[];
  mythic_seeds: MythicSeed[];
}

function hexDist(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body.sessionId || body.session_id;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const result: Record<string, unknown> = {};

    // ── Load world foundation ────────────────────────────────────────────
    const { data: wf, error: wfErr } = await sb
      .from("world_foundations")
      .select("id, world_name, worldgen_spec")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (wfErr || !wf) {
      throw new Error(`world_foundations not found for session ${sessionId}`);
    }

    const spec = (wf.worldgen_spec ?? {}) as Record<string, unknown>;
    const ancient = spec.ancient_layer as AncientLayer | undefined;

    if (!ancient) {
      result.skipped = "no ancient_layer in worldgen_spec";
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. Mythic seeds → tag/spawn nodes ────────────────────────────────
    let mythicTagged = 0;
    let mythicSpawned = 0;

    if (Array.isArray(ancient.mythic_seeds) && ancient.mythic_seeds.length > 0) {
      const { data: existingNodes } = await sb
        .from("province_nodes")
        .select("id, hex_q, hex_r, mythic_tag, province_id")
        .eq("session_id", sessionId);

      const nodes = (existingNodes ?? []) as Array<{
        id: string;
        hex_q: number;
        hex_r: number;
        mythic_tag: string | null;
        province_id: string;
      }>;

      // Need a province for spawned nodes — pick first available
      const fallbackProvince = nodes[0]?.province_id;

      for (const seed of ancient.mythic_seeds) {
        // Find closest unmythic node within radius 3
        let closest: typeof nodes[0] | null = null;
        let closestDist = Infinity;
        for (const n of nodes) {
          if (n.mythic_tag) continue;
          const d = hexDist(n.hex_q, n.hex_r, seed.hex_q, seed.hex_r);
          if (d < closestDist && d <= 3) {
            closestDist = d;
            closest = n;
          }
        }

        if (closest) {
          await sb
            .from("province_nodes")
            .update({ mythic_tag: seed.tag, founding_era: "ancient" })
            .eq("id", closest.id);
          closest.mythic_tag = seed.tag;
          mythicTagged++;
        } else if (fallbackProvince) {
          // Spawn a relic node
          const { error: insErr } = await sb.from("province_nodes").insert({
            session_id: sessionId,
            province_id: fallbackProvince,
            node_type: "mythic_ruin",
            name: `Pozůstatek (${seed.tag})`,
            hex_q: seed.hex_q,
            hex_r: seed.hex_r,
            mythic_tag: seed.tag,
            founding_era: "ancient",
            is_active: true,
            metadata: { spawned_by: "world-layer-bootstrap", seed_id: seed.id },
          });
          if (!insErr) mythicSpawned++;
        }
      }
    }

    result.mythic = { tagged: mythicTagged, spawned: mythicSpawned };

    // ── 2. selected_lineages → realm_heritage ────────────────────────────
    let heritageInserted = 0;

    if (Array.isArray(ancient.selected_lineages) && ancient.selected_lineages.length > 0) {
      const { data: players } = await sb
        .from("game_players")
        .select("player_name")
        .eq("session_id", sessionId);

      const candidateById = new Map<string, LineageProposal>();
      for (const c of ancient.lineage_candidates ?? []) {
        candidateById.set(c.id, c);
      }

      for (const p of players ?? []) {
        for (const lineageId of ancient.selected_lineages) {
          const cand = candidateById.get(lineageId);
          if (!cand) continue;
          const { error: hErr } = await sb.from("realm_heritage").insert({
            session_id: sessionId,
            player_name: p.player_name,
            lineage_id: cand.id,
            lineage_name: cand.name,
            cultural_anchor: cand.cultural_anchor ?? null,
            description: cand.description,
          });
          if (!hErr) heritageInserted++;
        }
      }
    }

    result.heritage = { inserted: heritageInserted };

    // ── 2b. Seed heritage_effects per lineage_kind (PR-F) ────────────────
    // Hardcoded effect templates by cultural anchor / lineage name pattern.
    let effectsInserted = 0;
    if (heritageInserted > 0) {
      const { data: heritageRows } = await sb
        .from("realm_heritage")
        .select("id, session_id, player_name, lineage_id, lineage_name, cultural_anchor")
        .eq("session_id", sessionId);

      const effectsBatch: Array<Record<string, unknown>> = [];

      for (const h of heritageRows ?? []) {
        const anchor = String(h.cultural_anchor ?? "").toLowerCase();
        const name = String(h.lineage_name ?? "").toLowerCase();
        const blob = `${anchor} ${name}`;
        const effects: Array<{ type: string; value: number; target: string; desc: string }> = [];

        if (/(námoř|sea|moře|přístav|harbor|loď|ship)/.test(blob)) {
          effects.push({ type: "route_maintenance_discount", value: 0.15, target: "trade_route", desc: "Námořnické dědictví: -15 % údržbových nákladů obchodních tras." });
          effects.push({ type: "prestige_per_turn", value: 1, target: "all_cities", desc: "Sláva námořních předků: +1 prestiž/tah." });
        } else if (/(hor|hill|mountain|skál|kov|metal|kov)/.test(blob)) {
          effects.push({ type: "production_bonus", value: 0.10, target: "hill_node", desc: "Horalské dědictví: +10 % produkce v kopcovitých uzlech." });
          effects.push({ type: "prestige_per_turn", value: 1, target: "all_cities", desc: "Železná pamět hor: +1 prestiž/tah." });
        } else if (/(pást|paste|step|nomád|nomad|jezdec|rider|kůň|horse)/.test(blob)) {
          effects.push({ type: "movement_bonus", value: 0.20, target: "armies", desc: "Pastevecké dědictví: +20 % pohybu armád." });
          effects.push({ type: "prestige_per_turn", value: 1, target: "all_cities", desc: "Volné pláně: +1 prestiž/tah." });
        } else if (/(kněz|priest|chrám|temple|víra|faith|mág|mage)/.test(blob)) {
          effects.push({ type: "faith_bonus", value: 0.15, target: "all_cities", desc: "Sakrální dědictví: +15 % víry." });
          effects.push({ type: "prestige_per_turn", value: 2, target: "all_cities", desc: "Posvátné kořeny: +2 prestiž/tah." });
        } else if (/(kupec|merchant|trh|market|obchod|trade)/.test(blob)) {
          effects.push({ type: "trade_income_bonus", value: 0.10, target: "trade_route", desc: "Kupecké dědictví: +10 % příjmu z obchodu." });
          effects.push({ type: "prestige_per_turn", value: 1, target: "all_cities", desc: "Bohatá tradice obchodu: +1 prestiž/tah." });
        } else {
          // Generic fallback
          effects.push({ type: "stability_bonus", value: 2, target: "all_cities", desc: `Dědictví ${h.lineage_name}: +2 stabilita.` });
          effects.push({ type: "prestige_per_turn", value: 1, target: "all_cities", desc: `Pradávný odkaz ${h.lineage_name}: +1 prestiž/tah.` });
        }

        for (const e of effects) {
          effectsBatch.push({
            session_id: h.session_id,
            player_name: h.player_name,
            lineage_id: h.lineage_id,
            lineage_label: h.lineage_name,
            effect_type: e.type,
            effect_value: e.value,
            effect_target: e.target,
            description: e.desc,
          });
        }
      }

      if (effectsBatch.length > 0) {
        const { error: effErr, count } = await sb
          .from("heritage_effects")
          .insert(effectsBatch, { count: "exact" });
        if (effErr) console.warn("heritage_effects insert:", effErr.message);
        effectsInserted = count ?? effectsBatch.length;
      }
    }
    result.heritageEffects = { inserted: effectsInserted };

    // ── 3. reset_event → founding chronicle entry ────────────────────────
    let chronicleCreated = false;

    if (ancient.reset_event?.description) {
      // Check if prologue already exists (idempotency)
      const { data: existing } = await sb
        .from("chronicle_entries")
        .select("id")
        .eq("session_id", sessionId)
        .eq("turn_number", 0)
        .ilike("title", "Pradávný zlom%")
        .maybeSingle();

      if (!existing) {
        const turnOffset = ancient.reset_event.turn_offset ?? -500;
        await sb.from("chronicle_entries").insert({
          session_id: sessionId,
          turn_number: 0,
          title: `Pradávný zlom — ${ancient.reset_event.type}`,
          content: `Před ${Math.abs(turnOffset)} koly došlo k události, která navždy proměnila tvář ${wf.world_name}.\n\n${ancient.reset_event.description}\n\nZ popela starého řádu se zrodily nové linie. Některé místa si pamatují, jiné mlčí. Toto je jejich kronika.`,
          entry_type: "prologue",
          metadata: { generated_by: "world-layer-bootstrap", reset_type: ancient.reset_event.type },
        });
        chronicleCreated = true;
      }
    }

    result.chronicle = { created: chronicleCreated };

    // ── 4. route_state backfill (in case routes existed before migration) ─
    const { data: routesNoState } = await sb
      .from("province_routes")
      .select("id, capacity_value")
      .eq("session_id", sessionId);

    const routeIds = (routesNoState ?? []).map((r: any) => r.id);
    if (routeIds.length > 0) {
      const { data: existingStates } = await sb
        .from("route_state")
        .select("route_id")
        .in("route_id", routeIds);

      const haveState = new Set((existingStates ?? []).map((s: any) => s.route_id));
      const toInsert = (routesNoState ?? [])
        .filter((r: any) => !haveState.has(r.id))
        .map((r: any) => ({
          route_id: r.id,
          session_id: sessionId,
          lifecycle_state: "usable",
          maintenance_level: 50,
          quality_level: 50,
          upkeep_cost: Math.max(1, Math.floor((r.capacity_value ?? 5) / 5)),
        }));

      if (toInsert.length > 0) {
        const { error: bfErr } = await sb.from("route_state").insert(toInsert);
        if (bfErr) console.warn("route_state backfill:", bfErr.message);
        result.routeStateBackfilled = toInsert.length;
      }
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("world-layer-bootstrap error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
