import { supabase } from "@/integrations/supabase/client";
import type { GoodRow, ProducerRow, DemandRow, FlowRow, Anomaly, Totals, LedgerBalance, LedgerPrice, CityAccountRow, ProductChoiceRow } from "../../supabase/functions/economy-dev-snapshot/build";
import type { CostRow, CostComponent, BomInput, CostComparison, SpecificGoodRow } from "../../supabase/functions/economy-dev-snapshot/costs";
export type { GoodRow, ProducerRow, DemandRow, FlowRow, Anomaly, Totals, LedgerBalance, LedgerPrice, CityAccountRow, ProductChoiceRow, CostRow, CostComponent, BomInput, CostComparison, SpecificGoodRow };
export { compareCosts } from "../../supabase/functions/economy-dev-snapshot/costs";
export interface CatalogueRecipe { key: string; role: string; output: string; qty: number; inputs: { good: string; qty: number }[] }

export interface Capped<T> { rows: T[]; total: number; truncated: boolean }
export interface CityRow { id: string; name: string; owner: string; cell: string; population: number | null; totals: Totals;
  accounts: CityAccountRow | null; gdp_delta: number | null; roles: string[] | null;
  shortages: { good: string; unmet: number; demand: number }[]; surpluses: { good: string; surplus: number }[];
  bottlenecks: { producer: string; good: string; required: number; supplied: number }[] }
export interface EconomyDevMeta { schemaVersion: string; generatedAt: string; sessionId: string; roomCode: string | null;
  currentTurn: number; resolvingTurn: number | null; initStatus: string | null; lastCommittedTurn: number | null;
  selectedTurn: number | null; availableTurns: { turn_number: number; committed: boolean; created_at: string }[];
  ledgerCreatedAt?: string; ledgerCommitted?: boolean; budgetMode?: string | null; previousAccountsTurn?: number | null; rowLimit?: number }
export interface EconomyDevSnapshot {
  industrial_inputs?: import('../../supabase/functions/_shared/goodsEconomy').IndustrialInput[];
  meta: EconomyDevMeta; reason?: string; ledger?: null;
  state?: { guards: { turn_number: number; status: string; started_at: string | null; finished_at: string | null; error: string | null; resumable: boolean | null }[];
    journal: { turn_number: number; phase: string; completed_at: string }[]; refreshLock: { locked_at: string; locked_by: string | null } | null };
  cities?: CityRow[]; world?: Totals; goods?: GoodRow[]; producers?: Capped<ProducerRow>; demand?: Capped<DemandRow>;
  fuel_guidance?: import('../../supabase/functions/_shared/fuelGuidance').FuelWarning[];
  import_blockers?: { city: string; good: string; unmet: number; reason: string; source: string | null }[];
  costs?: Capped<CostRow>; specific?: SpecificGoodRow[]; catalogueRecipes?: CatalogueRecipe[];
  flows?: Capped<FlowRow>; edges?: Capped<{ id: string; from: string; to: string; capacity: number; used: number }>;
  prices?: Capped<LedgerPrice>; balances?: Capped<LedgerBalance>; famous?: { city: string; good: string }[]; anomalies?: Anomaly[];
  fiscal?: { source: string; realms: Record<string, number | string | null>[]; capitalStock: { city_id: string; stock: number; last_delta: number; last_turn: number }[] };
  legacy?: { source: string; total: number; active: number; amountPerTurn: number; goldPerTurn: number };
}

/** Read-only admin diagnostic fetch. Never triggers refresh-economy or any write. */
export async function fetchEconomyDevSnapshot(sessionId: string, turn: number | null): Promise<EconomyDevSnapshot> {
  const { data, error } = await supabase.functions.invoke("economy-dev-snapshot", { body: { sessionId, turn } });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) { try { msg = (await ctx.json())?.error || msg; } catch { /* keep message */ } }
    throw new Error(msg);
  }
  return data as EconomyDevSnapshot;
}

export function toCsv(rows: object[]): string {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell((r as Record<string, unknown>)[c])).join(","))].join("\n");
}
