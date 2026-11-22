import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionalSettlements, buildingReserveReport, withPersistedVillages } from '../../supabase/functions/_shared/regionalSettlementEconomy';
import { ruralSettlementReason, sanitizeVillageName, RURAL_SETTLEMENT_REACH, RURAL_SETTLEMENT_COST } from '../../supabase/functions/_shared/ruralSettlement';

const rp = (id: string, extra: any = {}) => ({ producer: id, city: 'c1', good: 'grain', capacity: 10, realized: 0, jobs_capacity: 20, labor_origin: 'rural',
  rural_population: 500, rural_workforce: 100, rural_workforce_employed: 0, parcel: { id: 'p-' + id, grid_x: 3, grid_y: 4 }, factors: { logistics: 0 }, blocked: 'missing_local_delivery_route', ...extra });
const parcel = { id: 'p1', grid_x: 3, grid_y: 4, city_id: 'c1', owner_player: 'A', claim_kind: 'worked' };
const city = { id: 'c1', owner_player: 'A', grid_x: 2, grid_y: 4 };
const ok = { player: 'A', parcel, city, name: 'Lhota', villageInCell: false, villageOnParcel: false };

describe('stage 1 fixes', () => {
  it('keeps a blocked zero-output rural site and its cell population in the settlement', () => {
    const [s] = regionalSettlements({ producers: [rp('a')] });
    expect(s.rural_population).toBe(500); expect(s.gross_output_units).toBe(0); expect(s.logistics).toBe('blocked');
    expect(s.reasons.some(r => r.includes('missing_local_delivery_route'))).toBe(true);
  });
  it('labels demand as an attributed share of the city basket', () => {
    const [s] = regionalSettlements({ producers: [rp('a')], labor: [{ city: 'c1', population: 1000 }], cities: [{ id: 'c1', balances: [{ demand: 40 }] }] });
    expect(s.attributed_demand_units).toBe(20); expect(s.demand_attribution).toBe('population_share_of_city_basket');
  });
  it('null construction efficiency stays unknown, never a 0 point fallback', () => {
    const r = buildingReserveReport([{ city: 'c', good: 'raw_stone', stored: 5 }], null);
    expect(r.lines[0].point_equivalent).toBeNull(); expect(r.convertible_points).toBeNull();
  });
  it('every early zero-output producer diagnostic in goodsEconomy carries rural labour metadata', () => {
    const src = readFileSync('supabase/functions/_shared/goodsEconomy.ts', 'utf8');
    const pushes = src.split('diagnostics.push(').slice(1).map(x => x.slice(0, 400)).filter(x => x.includes('realized:0'));
    expect(pushes.length).toBeGreaterThanOrEqual(4);
    for (const x of pushes) expect(x.includes('ruralMeta(p)') || x.includes('...labor')).toBe(true);
  });
});

describe('rural settlement founding rules', () => {
  it('allows an own worked parcel within reach', () => { expect(ruralSettlementReason(ok)).toBeNull(); });
  it('rejects foreign, non-worked, too far or duplicate cells', () => {
    expect(ruralSettlementReason({ ...ok, player: 'B' })).not.toBeNull();
    expect(ruralSettlementReason({ ...ok, parcel: { ...parcel, claim_kind: 'urban' } })).not.toBeNull();
    expect(ruralSettlementReason({ ...ok, parcel: { ...parcel, grid_x: 2 + RURAL_SETTLEMENT_REACH + 1 } })).not.toBeNull();
    expect(ruralSettlementReason({ ...ok, villageInCell: true })).not.toBeNull();
    expect(ruralSettlementReason({ ...ok, city: { ...city, owner_player: 'B' } })).not.toBeNull();
  });
  it('requires a sane name and a fixed server price', () => {
    expect(sanitizeVillageName(' <b> ')).toBeNull(); expect(sanitizeVillageName('  Horní   Lhota ')).toBe('Horní Lhota');
    expect(RURAL_SETTLEMENT_COST).toBe(20);
  });
});

describe('persisted villages overlay', () => {
  const v = { id: 'v1', city_id: 'c1', parcel_id: 'p1', grid_x: 3, grid_y: 4, name: 'Lhota', level: 1, founded_turn: 2 };
  it('marks the cell as a village without adding population', () => {
    const base = regionalSettlements({ producers: [rp('a'), rp('b')] });
    const [s] = withPersistedVillages(base, [v]);
    expect(s.kind).toBe('village'); expect(s.rural_population).toBe(500); expect(s.village?.name).toBe('Lhota');
  });
  it('lists a village without sites with zero output and no invented numbers', () => {
    const [s] = withPersistedVillages([], [v]);
    expect(s.kind).toBe('village'); expect(s.gross_output_units).toBe(0); expect(s.rural_population).toBeNull(); expect(s.tax_collected).toBeNull();
  });
});
