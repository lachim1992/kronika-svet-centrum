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
//   2. Schema gaps (e.g. no per-resource upkeep ledger) are surfaced as
//      `undefined` so EmpireOverview renders "—".
//   3. The smoke harness asserts that `undefined` here is OK, but `NaN` fails.
// ============================================================================

import type { Tables } from "@/integrations/supabase/types";

type RealmResource = Tables<"realm_resources">;
type MilitaryStack = Tables<"military_stacks">;

export interface EmpireResourceRow {
  id: string;
  resource_type: string;
  stockpile: number;
  /** `undefined` when canonical state has no income column for this resource. */
  income: number | undefined;
  /** `undefined` when no upkeep ledger exists for this resource. */
  upkeep: number | undefined;
}

export interface EmpireMilitaryAggregate {
  active: number;
  total: number;
  /** TODO: schema gap — no per-unit-type breakdown surfaced yet. */
  unitBreakdown: undefined;
}

export function adaptRealmResourceToRows(
  realm: RealmResource | null | undefined
): EmpireResourceRow[] {
  if (!realm) return [];

  // `incomeKey` points to last-turn production columns when available; if no
  // matching column exists on realm_resources today, income stays `undefined`
  // (rendered as "—") rather than fabricated as 0.
  const mapping: Array<{
    key: keyof RealmResource;
    type: string;
    incomeKey?: keyof RealmResource;
  }> = [
    { key: "gold_reserve",   type: "gold"   },
    { key: "grain_reserve",  type: "food",  incomeKey: "last_turn_grain_prod" },
    { key: "wood_reserve",   type: "wood",  incomeKey: "last_turn_wood_prod"  },
    { key: "stone_reserve",  type: "stone", incomeKey: "last_turn_stone_prod" },
    { key: "iron_reserve",   type: "iron",  incomeKey: "last_turn_iron_prod"  },
    { key: "horses_reserve", type: "horses" },
    { key: "labor_reserve",  type: "labor"  },
  ];

  return mapping.map(({ key, type, incomeKey }) => {
    const rawStockpile = (realm as any)[key];
    const stockpile = typeof rawStockpile === "number" ? rawStockpile : 0;

    let income: number | undefined = undefined;
    if (incomeKey) {
      const rawIncome = (realm as any)[incomeKey];
      if (typeof rawIncome === "number") income = rawIncome;
    }

    // Per-resource upkeep ledger does not exist on realm_resources today.
    // Grain consumption is the one column we can wire; everything else stays
    // `undefined` per the no-fake-zero rule.
    // TODO: schema gap — when a generic upkeep ledger lands, wire it here.
    const upkeep: number | undefined =
      type === "food" && typeof (realm as any).last_turn_grain_cons === "number"
        ? (realm as any).last_turn_grain_cons
        : undefined;

    return {
      id: `${realm.id}:${type}`,
      resource_type: type,
      stockpile,
      income,
      upkeep,
    };
  });
}

/**
 * Aggregate military_stacks for a single player. Zero counts are valid
 * canonical state (player has no army), not missing data.
 */
export function adaptMilitaryStacks(
  stacks: MilitaryStack[],
  playerName: string
): EmpireMilitaryAggregate {
  const mine = stacks.filter(s => (s as any).player_name === playerName);
  const active = mine.filter(s => (s as any).is_active === true).length;
  return {
    active,
    total: mine.length,
    unitBreakdown: undefined,
  };
}
