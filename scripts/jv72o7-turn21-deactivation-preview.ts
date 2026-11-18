/** Read-only preview: committed turn-21 snapshot vs the same snapshot with soldiers derived from the
 * current (all inactive) military_stacks. Pure resolveGoodsEconomy, no DB access, no writes. */
import { produced, resolveGoodsEconomy, type Snapshot } from "../supabase/functions/_shared/goodsEconomy";
import { actualSoldiers } from "../supabase/functions/_shared/manpower";
import fixture from "../src/test/fixtures/jv72o7-turn21-committed-snapshot.json";

// Current DB rows (read with SELECT on 2026-11-18 18:52 UTC): all three stacks is_active=false.
export const CURRENT_STACKS = [
  { player_name: "Player", name: "Armáda Player", is_active: false, is_deployed: true, soldiers: 1000 },
  { player_name: "Player", name: "pojebemtoooo", is_active: false, is_deployed: false, soldiers: 101 },
  { player_name: "AI Frakce 1", name: "Železná horda", is_active: false, is_deployed: false, soldiers: 7373 },
];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export function deactivatedSnapshot(base: Snapshot, stacks = CURRENT_STACKS): Snapshot {
  const next = clone(base);
  for (const owner of new Set(next.cities.map(c => c.owner))) {
    const cities = next.cities.filter(c => c.owner === owner);
    const before = cities.reduce((s, c) => s + c.soldiers, 0);
    const after = actualSoldiers(stacks.filter(s => s.player_name === owner));
    for (const c of cities) c.soldiers = before > 0 ? c.soldiers * after / before : 0;
  }
  return next;
}
const BASKETS = ["staple_food", "drinking_water", "fuel", "clothing", "tools"];
export function summarize(input: Snapshot, r: ReturnType<typeof resolveGoodsEconomy>) {
  const basket = new Map(input.goods.map(g => [g.key, g.basket]));
  const owner = new Map(input.cities.map(c => [c.id, c.owner]));
  const pcity = new Map(input.producers.map(p => [p.id, p.city]));
  const owners: Record<string, any> = {};
  for (const o of [...new Set(input.cities.map(c => c.owner))].sort()) {
    const bal = r.balances.filter(b => owner.get(b.city) === o);
    const diag = r.diagnostics.filter(d => owner.get(pcity.get(d.producer)!) === o);
    const labor = r.labor.filter(l => owner.get(l.city) === o);
    owners[o] = {
      soldiers: input.cities.filter(c => c.owner === o).reduce((s, c) => s + c.soldiers, 0),
      civilian_workforce: labor.reduce((s, l) => s + l.available_workforce, 0),
      urban_employed: labor.reduce((s, l) => s + l.employed_total, 0),
      lines: { running: diag.filter(d => d.realized > 1e-9).length,
        no_workers: diag.filter(d => d.blocked === "no_workers").length,
        capacity_labor_or_staffing: diag.filter(d => d.blocked === "capacity_labor_or_staffing").length,
        missing_recipe_inputs: diag.filter(d => d.blocked === "missing_recipe_inputs").length },
      coverage: Object.fromEntries(BASKETS.map(k => {
        const rows = bal.filter(b => basket.get(b.good) === k);
        const d = rows.reduce((s, b) => s + b.demand, 0), sat = rows.reduce((s, b) => s + b.consumed_household + b.consumed_state, 0);
        return [k, d > 0 ? +(100 * sat / d).toFixed(1) : null];
      })),
      produced_food: +bal.filter(b => basket.get(b.good) === "staple_food").reduce((s, b) => s + produced(b), 0).toFixed(3),
    };
  }
  const blockers: Record<string, number> = {};
  for (const b of r.importBlockers) blockers[b.reason] = (blockers[b.reason] || 0) + 1;
  return { owners, flows: r.flows.length,
    flowGoods: r.flows.map(f => `${f.good}:${f.qty.toFixed(2)} ${owner.get(f.source)}→${owner.get(f.destination)}`),
    blockers, unreachable: r.importBlockers.filter(b => b.reason === "route_unreachable").map(b => `${b.good} ${b.source}→${b.city}`) };
}
export function runTurn21Preview() {
  const base = fixture as unknown as Snapshot;
  const frozen = JSON.stringify(base);
  const committed = resolveGoodsEconomy(clone(base));
  const deact = deactivatedSnapshot(base);
  const after = resolveGoodsEconomy(deact);
  return { inputUnchanged: JSON.stringify(base) === frozen, committedReplay: summarize(base, committed), deactivated: summarize(deact, after) };
}
if ((import.meta as any).main) console.log(JSON.stringify(runTurn21Preview(), null, 2));
