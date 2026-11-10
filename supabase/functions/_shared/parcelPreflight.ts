import { resolveGoodsEconomy, type Snapshot } from './goodsEconomy.ts';
import { parcelProducers, parcelClosing, type EconomicParcel, type ParcelTerrain } from './parcelEconomy.ts';

/** Read-only replay of the exact adapter opening/staffing and committed ecology candidate.
 * First step preserves adapter sources; later steps carry physical stores and ecology forward. */
export function parcelSubsistencePreflight(baseline: Snapshot, parcels: EconomicParcel[], terrain: ParcelTerrain[], recipes: Map<string, any>, steps = 5) {
  let opening = baseline.opening;
  let ecology = {};
  const coverage = [];
  for (let step = 0; step < steps; step++) {
    const sources = step === 0 ? baseline.producers.filter(p => p.parcel)
      : parcelProducers(parcels, terrain, baseline.cities, recipes, baseline.turn + step, ecology);
    const out = resolveGoodsEconomy({ ...baseline, turn: baseline.turn + step, opening,
      producers: [...baseline.producers.filter(p => !p.parcel), ...sources] });
    ecology = parcelClosing(sources, out.diagnostics);
    opening = out.balances.filter(b => b.stored > 0).map(b => ({ city: b.city, good: b.good, qty: b.stored, quality: b.quality, lots: b.stored_lots }));
    for (const city of baseline.cities) for (const basket of ['staple_food', 'drinking_water', 'fuel']) {
      const balances = out.balances.filter(b => b.city === city.id && baseline.goods.find(g => g.key === b.good)?.basket === basket);
      const demand = balances.reduce((sum, b) => sum + b.demand, 0);
      const unmet = balances.reduce((sum, b) => sum + b.unmet_demand, 0);
      coverage.push({ city: city.id, basket, step: step + 1, coverage: demand ? 1 - unmet / demand : 1 });
    }
  }
  return { coverage, unsafe: coverage.filter(b => b.coverage + 1e-6 < (b.basket === 'fuel' ? 0.8 : 1)),
    fifth: coverage.filter(b => b.step === steps) };
}