import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getFiscalIncome, getEconomicActivity, getMarketPosition } from "@/lib/economyFlow";

const fn = (name: string) => readFileSync(`supabase/functions/${name}/index.ts`, "utf8");

/**
 * Economy Integrity Pass — static contract guards.
 * See docs/architecture/economy-contract.md (INVARIANT 1-3).
 */
describe("INVARIANT 1 — process-turn is the sole turn-fiscal writer", () => {
  it("compute-basket-trade-flows never writes realm fiscal pillars", () => {
    const src = fn("compute-basket-trade-flows");
    expect(src).not.toMatch(/goods_wealth_fiscal\s*:/);
    expect(src.includes('from("realm_resources")\n') && /update\(\s*\{[^}]*goods_wealth_fiscal/.test(src)).toBe(false);
  });

  it("aggregate-realm-totals writes totals only, no fiscal pillars", () => {
    const src = fn("aggregate-realm-totals");
    for (const col of ["wealth_pop_tax", "wealth_domestic_market", "goods_wealth_fiscal", "gold_reserve", "legitimacy"]) {
      expect(src).not.toMatch(new RegExp(`${col}\\s*:`));
    }
    expect(src).toMatch(/total_gdp/);
    expect(src).toMatch(/total_production/);
  });

  it("process-turn publishes the five separate tax bases", () => {
    const src = fn("process-turn");
    for (const base of ["domestic_tax_base", "market_tax_base", "transit_tax_base", "extraction_tax_base", "poll_tax_base"]) {
      expect(src).toContain(base);
    }
  });
});

describe("HISTORY GUARD — derived recompute never appends event logs", () => {
  it("compute-trade-systems gates world_events behind emit_events", () => {
    const src = fn("compute-trade-systems");
    expect(src).toMatch(/emit_events\s*===\s*true/);
    expect(src).toMatch(/if\s*\(emitEvents\s*&&\s*eventsToInsert\.length/);
  });

  it("refresh-economy does not enable event emission", () => {
    expect(fn("refresh-economy")).not.toContain("emit_events");
  });

  it("commit-turn enables event emission for trade systems", () => {
    expect(fn("commit-turn")).toMatch(/compute-trade-systems[\s\S]{0,200}emit_events:\s*true/);
  });
});

describe("INVARIANT 2 — refresh-economy is a pure derived recompute", () => {
  const src = fn("refresh-economy");

  it("does not invoke process-turn", () => {
    expect(src).not.toContain("process-turn");
  });

  it("does not write treasury, legitimacy or history", () => {
    expect(src).not.toMatch(/gold_reserve\s*:/);
    expect(src).not.toMatch(/legitimacy\s*:/);
    expect(src).not.toMatch(/_history"\)[\s\S]{0,40}\.insert/);
  });

  it("guards the fiscal pillars before and after the chain", () => {
    expect(src).toContain("FISCAL_COLUMNS");
    expect(src).toContain("fiscal_unchanged");
  });

  it("runs the canonical step order ending in aggregation", () => {
    const order = [
      "compute-province-routes",
      "compute-hex-flows",
      "compute-trade-systems",
      "compute-trade-flows",
      "compute-basket-trade-flows",
      "compute-economy-flow",
      "aggregate-realm-totals",
    ];
    let cursor = -1;
    for (const step of order) {
      const at = src.indexOf(step, cursor + 1);
      expect(at, step).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("uses a DB lock, not only an in-memory one", () => {
    expect(src).toContain("economy_recompute_locks");
  });

  it("compute-economy-flow writes no history and no realm aggregates", () => {
    const eco = fn("compute-economy-flow");
    expect(eco).not.toMatch(/node_economy_history"\)[\s\S]{0,60}\.insert/);
    expect(eco).not.toMatch(/from\("realm_resources"\)[\s\S]{0,80}\.update/);
  });
});

describe("INVARIANT 3 — snapshot only after the whole pipeline succeeds", () => {
  const src = fn("commit-turn");

  it("aggregates before writing history", () => {
    const agg = src.indexOf("aggregate-realm-totals");
    const hist = src.indexOf("node_economy_history");
    expect(agg).toBeGreaterThan(0);
    expect(hist).toBeGreaterThan(agg);
  });

  it("marks the economy stale instead of snapshotting on failure", () => {
    expect(src).toContain("stale");
    expect(src).toMatch(/aggregationOk/);
  });

  it("writes history idempotently for (session, turn)", () => {
    expect(src).toMatch(/node_economy_history"\)[\s\S]{0,200}\.delete\(\)/);
  });
});

describe("Krok 6 — node capacity applies without an explicit production order", () => {
  it("compute-trade-flows treats a missing order as implicit auto", () => {
    const src = fn("compute-trade-flows");
    expect(src).toContain("auto_implicit");
    expect(src).toContain("PRODUCTION_SHARE_CAP");
  });

  it("clears node_inventory for every node of the session (no ghost inventory)", () => {
    const src = fn("compute-trade-flows");
    expect(src).toMatch(/node_inventory"\)[\s\S]{0,200}\.delete\(\)/);
  });
});

describe("UI data contract", () => {
  const realm = {
    wealth_pop_tax: 12.5,
    wealth_domestic_market: 30,
    goods_wealth_fiscal: 7.5,
    goods_production_value: 100,
    goods_supply_volume: 240,
    commercial_retention: 0.62,
    total_gdp: 130,
    total_population: 4000,
    computed_modifiers: {
      tax_bases: {
        domestic_tax_base: 80, market_tax_base: 100, transit_tax_base: 10,
        extraction_tax_base: 25, poll_tax_base: 4000,
      },
      wealth_breakdown: {
        army_upkeep: 5, tolls: 1, sport_funding: 2,
        goods_fiscal_detail: { market_tariff: 4, transit_toll: 1.5, extraction_tax: 2 },
      },
    },
  };

  it("INCOME SUM — fiscal revenue equals the three income pillars only", () => {
    const fi = getFiscalIncome(realm);
    expect(fi.fiscalRevenue).toBeCloseTo(fi.popTax + fi.domesticMarket + fi.goodsFiscal, 6);
    expect(fi.totalIncome).toBeCloseTo(50, 6);
    expect(fi.recurringExpenses).toBeCloseTo(7, 6);
    expect(fi.netChange).toBeCloseTo(50 - 8, 6);
  });

  it("exposes all five tax bases", () => {
    const { taxBases } = getFiscalIncome(realm);
    expect(taxBases).toEqual({ domestic: 80, market: 100, transit: 10, extraction: 25, poll: 4000 });
  });

  it("goods fiscal detail carries real sub-components, not zeros", () => {
    const fi = getFiscalIncome(realm);
    expect(fi.marketTariff + fi.transitToll + fi.extractionTax).toBeCloseTo(7.5, 6);
  });

  it("activity and position read canonical columns, not dead v5 ones", () => {
    expect(getEconomicActivity(realm).domesticActivity).toBe(100);
    expect(getEconomicActivity(realm).supplyVolume).toBe(240);
    // Export is a measured column, never total_gdp − goods_production_value.
    expect(getMarketPosition({ ...realm, export_gross_value: 42 }).exportPosition).toBe(42);
    expect(getMarketPosition(realm).exportPosition).toBe(0);
    expect(getEconomicActivity({}).domesticActivity).toBe(0);
    expect(getMarketPosition({}).exportPosition).toBe(0);
  });

  it("TreasuryPanel has no parallel fiscal model and uses canonical GDP", () => {
    const src = readFileSync("src/components/economy/TreasuryPanel.tsx", "utf8");
    expect(src).toContain("getFiscalIncome");
    expect(src).toContain("realm.total_gdp");
    // No local Laffer recomputation, no fake unrest/migration effects
    expect(src).not.toMatch(/Math\.pow\(rate/);
    expect(src).not.toContain("Nepokoje +");
    expect(src).not.toContain("Migrace pryč");
  });

  it("history chart no longer calls a supply proxy 'HDP'", () => {
    const src = readFileSync("src/components/economy/goods-production/HistoryChartsPanel.tsx", "utf8");
    expect(src).toContain("Objem nabídky");
    expect(src).not.toMatch(/HDP \(domácí vs světové\)/);
  });

  it("fiscal_capture is documented as telemetry only", () => {
    const src = readFileSync("supabase/functions/compute-basket-trade-flows/index.ts", "utf8");
    expect(src).toContain("TELEMETRY ONLY");
    expect(src).toContain("fiscal_capture_total_telemetry");
  });

  it("commit-turn snapshot guard covers the whole derived pipeline", () => {
    const src = readFileSync("supabase/functions/commit-turn/index.ts", "utf8");
    expect(src).toContain("economyStepFailures");
    expect(src).toContain("pipelineFailed");
    expect(src).toMatch(/phase:\s*"physical"/);
    expect(src).toMatch(/phase:\s*"final"/);
  });

  it("process-turn uses fresh physical aggregates, not stale realm totals", () => {
    const src = readFileSync("supabase/functions/process-turn/index.ts", "utf8");
    expect(src).not.toMatch(/realm\.total_production\s*\|\|/);
    expect(src).not.toMatch(/realm\.total_capacity\s*\|\|/);
    expect(src).toContain("FRESH PHYSICAL AGGREGATES");
  });

  it("economyFlow no longer reads the dead wealth columns", () => {
    const src = readFileSync("src/lib/economyFlow.ts", "utf8");
    expect(src).not.toMatch(/realm\?\.wealth_domestic_component/);
    expect(src).not.toMatch(/realm\?\.wealth_market_share/);
  });
});

// ── Layer A → B → C (krok 4b/4c) ──────────────────────────────────────────
describe("Layer A/B/C separation", () => {
  it("process-turn has no parallel production macro", () => {
    const src = readFileSync("supabase/functions/process-turn/index.ts", "utf8");
    expect(src).not.toMatch(/totalCityProduction\s*[+\-]?=/);
    expect(src).not.toMatch(/const cityProduction\s*=/);
  });

  it("process-turn sources tax bases from the goods layer", () => {
    const src = readFileSync("supabase/functions/process-turn/index.ts", "utf8");
    expect(src).toContain("goodsDomesticConsumptionValue");
    expect(src).toContain("goodsExtractionValue");
    expect(src).toMatch(/gdp_market\s*=\s*goodsProductionValue/);
  });

  it("food comes from the staple_food basket only", () => {
    const src = readFileSync("supabase/functions/process-turn/index.ts", "utf8");
    expect(src).toContain("stapleByCity");
    expect(src).toMatch(/last_turn_grain_prod:\s*Math\.round\(totalFoodSupply\)/);
    // goods_supply_volume must not top up the grain reserve any more
    expect(src).not.toMatch(/globalGrainReserve \+= goodsSupplyBonus/);
  });

  it("production_reserve accumulation is explicitly deprecated", () => {
    const src = readFileSync("supabase/functions/process-turn/index.ts", "utf8");
    expect(src).toMatch(/DEPRECATED \/ UNRESOLVED: production_reserve/);
    expect(src).toMatch(/const productionIncome\s*=\s*0/);
  });

  it("ProductionOverviewCard shows the chain and never reads total_wealth", () => {
    const src = readFileSync("src/components/economy/ProductionOverviewCard.tsx", "utf8");
    expect(src).not.toMatch(/realm\.total_wealth/);
    expect(src).not.toMatch(/wealth_output/);
    expect(src).toContain("total_production_capacity");
    expect(src).toContain("goods_value_detail");
    expect(src).toContain("export_gross_value");
  });
});

// wealth_output allowlist: legacy abstract wealth-flow. MAY be read only by
// compute-economy-flow (its owner) and dev/debug views.
describe("wealth_output allowlist guard", () => {
  const forbidden = [
    "supabase/functions/process-turn/index.ts",
    "supabase/functions/aggregate-realm-totals/index.ts",
    "src/lib/economyFlow.ts",
    "src/components/economy/ProductionOverviewCard.tsx",
    "src/components/economy/TreasuryPanel.tsx",
    "src/components/economy/FiscalSubTab.tsx",
    "src/components/SupplyChainPanel.tsx",
  ];
  for (const file of forbidden) {
    it(`${file} does not read wealth_output`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/\.wealth_output/);
      expect(src).not.toMatch(/wealth_output:/);
    });
  }
});
