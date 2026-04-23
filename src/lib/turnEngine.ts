// Turn engine constants and helpers (client-side)
import { supabase } from "@/integrations/supabase/client";

// Settlement templates — canonical source is supabase/functions/_shared/physics.ts
// Client-side mirror for UI display only.
export const SETTLEMENT_TEMPLATES: Record<string, { peasants: number; burghers: number; clerics: number }> = {
  HAMLET:   { peasants: 0.80, burghers: 0.15, clerics: 0.05 },
  TOWNSHIP: { peasants: 0.60, burghers: 0.30, clerics: 0.10 },
  CITY:     { peasants: 0.40, burghers: 0.40, clerics: 0.20 },
  POLIS:    { peasants: 0.20, burghers: 0.55, clerics: 0.25 },
};

export const SETTLEMENT_DEFAULTS: Record<string, number> = {
  HAMLET: 800, TOWNSHIP: 2000, CITY: 5000, POLIS: 10000,
};

export const LEVEL_TO_SETTLEMENT: Record<string, string> = {
  Osada: "HAMLET", Městečko: "TOWNSHIP", Město: "CITY", Polis: "POLIS",
};

// ═══ 2-UNIT-TYPE SYSTEM ═══
// MILITIA: cheaper, weaker, available immediately (weight 0.8)
// PROFESSIONAL: stronger, requires barracks+smithy (weight 1.3)
export const UNIT_TYPE_LABELS: Record<string, string> = {
  MILITIA: "Milice",
  PROFESSIONAL: "Profesionálové",
};

export const UNIT_WEIGHTS: Record<string, number> = {
  MILITIA: 0.8,
  PROFESSIONAL: 1.3,
};

export const UNIT_GOLD_FACTOR: Record<string, number> = {
  MILITIA: 0.8,
  PROFESSIONAL: 2,
};

export const FORMATION_PRESETS: Record<string, { label: string; composition: { unit_type: string; manpower: number }[]; formation_type: string; morale: number; gold_override?: number; requires_buildings?: string[] }> = {
  militia: {
    label: "Milice",
    composition: [{ unit_type: "MILITIA", manpower: 400 }],
    formation_type: "UNIT",
    morale: 55,
  },
  professional: {
    label: "Profesionální vojsko",
    composition: [{ unit_type: "PROFESSIONAL", manpower: 400 }],
    formation_type: "UNIT",
    morale: 70,
    requires_buildings: ["barracks", "smithy"],
  },
  legion: {
    label: "Zárodek legie",
    composition: [{ unit_type: "MILITIA", manpower: 400 }, { unit_type: "PROFESSIONAL", manpower: 400 }],
    formation_type: "LEGION",
    morale: 70,
    gold_override: 80,
    requires_buildings: ["barracks", "smithy"],
  },
};

// ensureRealmResources & recomputeManpowerPool removed (War Plan v16):
// - realm_resources rows are bootstrapped server-side at world generation
// - manpower_pool is recomputed inside command-dispatch / turn engine
// - All canonical realm reads flow through Dashboard projector → props


// recruitStack removed — now handled server-side by command-dispatch RECRUIT_STACK

export async function migrateLegacyMilitary(sessionId: string) {
  // Find unmigrated legacy armies
  const { data: legacyArmies } = await supabase
    .from("military_capacity")
    .select("*")
    .eq("session_id", sessionId)
    .eq("migrated", false);

  if (!legacyArmies || legacyArmies.length === 0) return { migrated: 0 };

  let count = 0;
  for (const legacy of legacyArmies) {
    // Check if already mapped
    const { data: existing } = await supabase
      .from("legacy_military_map")
      .select("id")
      .eq("legacy_id", legacy.id)
      .maybeSingle();
    
    if (existing) continue;

    // Map legacy army_type to unit_type
    const unitTypeMap: Record<string, string> = {
      "Lehká": "INFANTRY", "Těžká": "INFANTRY", "Obléhací": "SIEGE", "Námořní": "INFANTRY",
    };
    const unitType = unitTypeMap[legacy.army_type] || "INFANTRY";
    const manpower = (legacy.iron_cost || 1) * 200; // Estimate from legacy iron cost

    const { data: stack } = await supabase.from("military_stacks").insert({
      session_id: sessionId,
      player_name: legacy.player_name,
      name: legacy.army_name,
      formation_type: "UNIT",
      morale: legacy.status === "Aktivní" ? 70 : 30,
      is_active: legacy.status === "Aktivní",
      legacy_military_id: legacy.id,
    }).select().single();

    if (stack) {
      await supabase.from("military_stack_composition").insert({
        stack_id: stack.id,
        unit_type: unitType,
        manpower,
      });

      await supabase.from("legacy_military_map").insert({
        legacy_id: legacy.id,
        stack_id: stack.id,
      });

      await supabase.from("military_capacity").update({ migrated: true }).eq("id", legacy.id);
      count++;
    }
  }

  return { migrated: count };
}
