import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * backfill-economy-tags
 *
 * Hydrates province_nodes with capability_tags and production_role
 * based on node_subtype → NODE_CAPABILITY_MAP mapping.
 *
 * Also auto-seeds resource_deposits on province_hexes based on biome.
 *
 * Callable from Dev panel or automatically during world-generate-init.
 */

// ── NODE_CAPABILITY_MAP (mirrors goodsCatalog.ts) ──
type ProductionRole = "source" | "processing" | "urban" | "guild";

const NODE_CAPABILITY_MAP: Record<string, { role: ProductionRole; tags: string[] }> = {
  // Source
  field: { role: "source", tags: ["farming"] },
  vineyard: { role: "source", tags: ["farming", "viticulture"] },
  hunting_ground: { role: "source", tags: ["herding", "gathering"] },
  pastoral_camp: { role: "source", tags: ["herding"] },
  fishery: { role: "source", tags: ["fishing"] },
  fishing_village: { role: "source", tags: ["fishing"] },
  mine: { role: "source", tags: ["mining"] },
  mining_camp: { role: "source", tags: ["mining"] },
  quarry: { role: "source", tags: ["quarrying"] },
  sawmill: { role: "source", tags: ["logging", "sawing"] },
  lumber_camp: { role: "source", tags: ["logging"] },
  herbalist: { role: "source", tags: ["gathering"] },
  resin_collector: { role: "source", tags: ["logging", "gathering"] },
  salt_pan: { role: "source", tags: ["mining"] },
  village: { role: "source", tags: ["farming", "herding"] },
  shrine: { role: "source", tags: ["ritual_craft"] },
  watchtower: { role: "source", tags: [] },
  outpost: { role: "source", tags: [] },
  // Processing
  smithy: { role: "processing", tags: ["smelting", "smithing"] },
  mill: { role: "processing", tags: ["milling"] },
  press: { role: "processing", tags: ["pressing"] },
  tannery: { role: "processing", tags: ["tanning"] },
  spinner: { role: "processing", tags: ["spinning"] },
  stonecutter: { role: "processing", tags: ["stonecutting"] },
  smokehouse: { role: "processing", tags: ["preserving"] },
  smelter: { role: "processing", tags: ["smelting"] },
  // Urban
  bakery: { role: "urban", tags: ["baking"] },
  forge: { role: "urban", tags: ["smithing", "armoring"] },
  weaver: { role: "urban", tags: ["weaving"] },
  winery: { role: "urban", tags: ["fermenting"] },
  pottery_workshop: { role: "urban", tags: ["crafting"] },
  armory: { role: "urban", tags: ["smithing", "armoring"] },
  builder_yard: { role: "urban", tags: ["construction"] },
  trade_hub: { role: "urban", tags: ["construction"] },
  trade_post: { role: "urban", tags: [] },
  // Guild
  guild_workshop: { role: "guild", tags: ["master_craft"] },
  master_workshop: { role: "guild", tags: ["master_craft"] },
  court_manufactory: { role: "guild", tags: ["master_craft"] },
  temple_workshop: { role: "guild", tags: ["ritual_craft", "master_craft"] },
};

// City nodes get urban role with basic tags
const CITY_TAGS: { role: ProductionRole; tags: string[] } = {
  role: "urban",
  tags: ["baking", "construction"],
};

// ── BIOME → RESOURCE DEPOSITS ──
const BIOME_DEPOSITS: Record<string, Array<{ key: string; chance: number; quality_min: number; quality_max: number }>> = {
  plains: [
    { key: "wheat", chance: 0.7, quality_min: 2, quality_max: 4 },
    { key: "game", chance: 0.3, quality_min: 1, quality_max: 3 },
    { key: "herbs", chance: 0.2, quality_min: 1, quality_max: 3 },
  ],
  forest: [
    { key: "timber", chance: 0.8, quality_min: 2, quality_max: 5 },
    { key: "game", chance: 0.5, quality_min: 2, quality_max: 4 },
    { key: "resin", chance: 0.4, quality_min: 1, quality_max: 3 },
    { key: "herbs", chance: 0.3, quality_min: 2, quality_max: 4 },
  ],
  mountains: [
    { key: "iron", chance: 0.6, quality_min: 2, quality_max: 5 },
    { key: "stone", chance: 0.7, quality_min: 2, quality_max: 4 },
    { key: "copper", chance: 0.3, quality_min: 1, quality_max: 4 },
    { key: "gold", chance: 0.1, quality_min: 1, quality_max: 3 },
    { key: "marble", chance: 0.15, quality_min: 2, quality_max: 5 },
  ],
  hills: [
    { key: "iron", chance: 0.4, quality_min: 1, quality_max: 4 },
    { key: "stone", chance: 0.6, quality_min: 2, quality_max: 4 },
    { key: "copper", chance: 0.3, quality_min: 1, quality_max: 3 },
    { key: "wheat", chance: 0.3, quality_min: 1, quality_max: 3 },
  ],
  coast: [
    { key: "fish", chance: 0.8, quality_min: 2, quality_max: 5 },
    { key: "salt", chance: 0.4, quality_min: 2, quality_max: 4 },
    { key: "wheat", chance: 0.2, quality_min: 1, quality_max: 2 },
  ],
  desert: [
    { key: "salt", chance: 0.5, quality_min: 2, quality_max: 4 },
    { key: "stone", chance: 0.3, quality_min: 1, quality_max: 3 },
    { key: "gold", chance: 0.1, quality_min: 1, quality_max: 3 },
    { key: "copper", chance: 0.2, quality_min: 1, quality_max: 3 },
  ],
  tundra: [
    { key: "game", chance: 0.4, quality_min: 1, quality_max: 3 },
    { key: "timber", chance: 0.2, quality_min: 1, quality_max: 2 },
    { key: "iron", chance: 0.2, quality_min: 1, quality_max: 3 },
  ],
  volcanic: [
    { key: "stone", chance: 0.5, quality_min: 2, quality_max: 5 },
    { key: "iron", chance: 0.3, quality_min: 2, quality_max: 4 },
    { key: "gold", chance: 0.15, quality_min: 1, quality_max: 3 },
  ],
  swamp: [
    { key: "herbs", chance: 0.5, quality_min: 2, quality_max: 4 },
    { key: "resin", chance: 0.3, quality_min: 1, quality_max: 3 },
    { key: "fish", chance: 0.3, quality_min: 1, quality_max: 3 },
  ],
  jungle: [
    { key: "timber", chance: 0.6, quality_min: 2, quality_max: 4 },
    { key: "herbs", chance: 0.5, quality_min: 2, quality_max: 5 },
    { key: "resin", chance: 0.4, quality_min: 2, quality_max: 4 },
    { key: "game", chance: 0.3, quality_min: 1, quality_max: 3 },
  ],
};

function seedRng(q: number, r: number, idx: number): number {
  // Simple deterministic hash
  let h = (q * 374761 + r * 668265 + idx * 982451) & 0x7fffffff;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  return (h & 0x7fffffff) / 0x7fffffff;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, seed_deposits } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── PHASE 1: Hydrate capability_tags + production_role ──
    const { data: nodes } = await sb.from("province_nodes")
      .select("id, node_subtype, node_type, city_id, capability_tags, production_role")
      .eq("session_id", session_id);

    if (!nodes || nodes.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No nodes found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const updates: Array<{ id: string; capability_tags: string[]; production_role: string }> = [];

    for (const node of nodes) {
      const subtype = node.node_subtype as string;
      let mapping = NODE_CAPABILITY_MAP[subtype];

      // For city nodes without explicit subtype mapping
      if (!mapping && node.city_id && node.node_type === "major") {
        mapping = CITY_TAGS;
      }

      if (!mapping) continue;

      // Only update if tags are empty or role is wrong
      const currentTags = node.capability_tags as string[] || [];
      const currentRole = node.production_role as string;

      if (
        currentTags.length === 0 ||
        currentRole !== mapping.role ||
        JSON.stringify(currentTags.sort()) !== JSON.stringify(mapping.tags.sort())
      ) {
        updates.push({
          id: node.id,
          capability_tags: mapping.tags,
          production_role: mapping.role,
        });
      }
    }

    // Batch update nodes
    for (const upd of updates) {
      await sb.from("province_nodes").update({
        capability_tags: upd.capability_tags,
        production_role: upd.production_role,
      }).eq("id", upd.id);
      updated++;
    }

    // ── PHASE 2: Auto-seed resource_deposits on hexes ──
    let depositsSeeded = 0;

    if (seed_deposits !== false) {
      const { data: hexes } = await sb.from("province_hexes")
        .select("id, q, r, biome, resource_deposits")
        .eq("session_id", session_id);

      if (hexes) {
        const hexesToUpdate: Array<{ id: string; deposits: any[] }> = [];

        for (const hex of hexes) {
          const existing = hex.resource_deposits as any[] || [];
          if (existing.length > 0) continue; // Don't overwrite

          const biome = (hex.biome as string || "plains").toLowerCase();
          const possibleDeposits = BIOME_DEPOSITS[biome] || BIOME_DEPOSITS["plains"];
          const newDeposits: any[] = [];

          for (let i = 0; i < possibleDeposits.length; i++) {
            const dep = possibleDeposits[i];
            const roll = seedRng(hex.q, hex.r, i);
            if (roll < dep.chance) {
              const qualityRoll = seedRng(hex.q, hex.r, i + 100);
              const quality = Math.round(dep.quality_min + qualityRoll * (dep.quality_max - dep.quality_min));
              newDeposits.push({
                resource_type_key: dep.key,
                quality,
                yield_per_turn: Math.max(1, Math.round(quality * 0.8)),
              });
            }
          }

          if (newDeposits.length > 0) {
            hexesToUpdate.push({ id: hex.id, deposits: newDeposits });
          }
        }

        for (const upd of hexesToUpdate) {
          await sb.from("province_hexes").update({
            resource_deposits: upd.deposits,
          }).eq("id", upd.id);
          depositsSeeded++;
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      nodes_total: nodes.length,
      nodes_updated: updated,
      hexes_deposits_seeded: depositsSeeded,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("backfill-economy-tags error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
