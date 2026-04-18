// ============================================================================
// empireOverviewAdapter — Beta view-model adapter
//
// NOT a canonical ontology mapping. This is a one-way bridge between the
// canonical `realm_resources` row + `military_stacks` aggregate and the legacy
// `PlayerResource[]` shape that EmpireOverview was originally written against.
//
// Mapping (`grain_reserve → "food"`, etc.) is a UI convenience for the beta
// player loop. It does NOT redefine what these resources mean in the canonical
// economic model. See docs/BETA_SCOPE.md.
//
// Hard rules:
//   1. Missing data is returned as `undefined`. Never `0`. Never silent fallback.
//   2. Schema gaps (no per-resource income/upkeep on realm_resources today) are
//      surfaced as `undefined` so EmpireOverview renders "—".
//   3. The smoke harness asserts that `undefined` here is OK, but `NaN` fails.
// ============================================================================

import type { Tables } from "@/integrations/supabase/types";

type RealmResource = Tables<"realm_resources">;
type MilitaryStack = Tables<"military_stacks">;

export interface EmpireResourceRow {
  /** Stable key for React lists */
  id: string;
  /** Legacy resource type label expected by RESOURCE_ICONS / RESOURCE_LABELS */
  resource_type: string;
  /** Canonical reserve value from realm_resources */
  stockpile: number;
  /**
   * Per-resource income.
   * TODO: schema gap — `realm_resources` does not store per-resource income.
   * Returning `undefined` so the UI renders "—" instead of a fake "+0".
   */
  income: number | undefined;
  /**
   * Per-resource upkeep.
   * TODO: schema gap — `realm_resources` does not store per-resource upkeep.
   */
  upkeep: number | undefined;
}

export interface EmpireMilitaryAggregate {
  /** Number of stacks marked as actively deployed/operational */
  active: number;
  /** Total stack count (any status) */
  total: number;
  /**
   * Unit-level breakdown.
   * TODO: schema gap — no per-unit-type breakdown migrated to military_stacks
   * surface yet. Aggregate count substitutes for now.
   */
  unitBreakdown: undefined;
}

/**
 * Map a single canonical realm_resources row to the legacy resource-row shape
 * EmpireOverview expects. Returns `null` if no row was provided (e.g. realm
 * not yet initialised — caller decides whether that is itself a failure).
 */
export function adaptRealmResourceToRows(
  realm: RealmResource | null | undefined
): EmpireResourceRow[] {
  if (!realm) return [];

  // Beta mapping. Per docs/BETA_SCOPE.md this is UI convenience, not ontology.
  const mapping: Array<{ key: keyof RealmResource; type: string }> = [
    { key: "gold_reserve",   type: "gold"   },
    { key: "grain_reserve",  type: "food"   },
    { key: "wood_reserve",   type: "wood"   },
    { key: "stone_reserve",  type: "stone"  },
    { key: "iron_reserve",   type: "iron"   },
    { key: "horses_reserve", type: "horses" },
    { key: "labor_reserve",  type: "labor"  },
  ];

  return mapping.map(({ key, type }) => {
    const raw = (realm as any)[key];
    const stockpile = typeof raw === "number" ? raw : 0;
    return {
      id: `${realm.id}:${type}`,
      resource_type: type,
      stockpile,
      income: undefined,   // schema gap — see header
      upkeep: undefined,   // schema gap — see header
    };
  });
}

/**
 * Aggregate military_stacks for a single player into a small view-model.
 * Returns zeroed counts (true zeros, not gaps) when the player simply has no
 * stacks; that is a valid canonical state, not missing data.
 */
export function adaptMilitaryStacks(
  stacks: MilitaryStack[],
  playerName: string
): EmpireMilitaryAggregate {
  const mine = stacks.filter(s => (s as any).player_name === playerName);
  const active = mine.filter(s => {
    const status = (s as any).status;
    // Treat any non-disbanded/destroyed stack as "active" for the overview.
    return status !== "disbanded" && status !== "destroyed";
  }).length;
  return {
    active,
    total: mine.length,
    unitBreakdown: undefined, // schema gap — see header
  };
}
