import { describe, it, expect } from 'vitest';
import { regionalSettlements, buildingReserveReport } from '../../supabase/functions/_shared/regionalSettlementEconomy';
const p = (id: string, city: string, extra: any = {}) => ({ producer: id, city, good: 'grain', capacity: 10, realized: 10, jobs_capacity: 20, labor_origin: 'rural',
  rural_population: 500, rural_workforce: 100, rural_workforce_employed: 20, parcel: { grid_x: 1, grid_y: 2 }, factors: { logistics: 1 }, margin: { revenue: 30, value_added: 12, operating_surplus: 5 }, ...extra });
describe('regionalSettlements', () => {
  it('counts a shared cell pool once and sums producers', () => {
    const [s] = regionalSettlements({ producers: [p('a', 'c1'), p('b', 'c1')], labor: [{ city: 'c1', population: 1000 }], cities: [{ id: 'c1', balances: [{ demand: 40 }] }] });
    expect(s.rural_population).toBe(500); expect(s.employed).toBe(40); expect(s.value_added).toBe(24); expect(s.attributed_demand_units).toBe(20); expect(s.tax_collected).toBeNull();
  });
  it('ignores urban producers', () => { expect(regionalSettlements({ producers: [p('a', 'c1', { labor_origin: undefined })] })).toEqual([]); });
  it('reports unknown logistics instead of full availability', () => {
    expect(regionalSettlements({ producers: [p('a', 'c1', { factors: {} })] })[0].logistics).toBe('unknown');
  });
});
describe('buildingReserveReport', () => {
  it('never adds point equivalent to converted reserve', () => {
    const r = buildingReserveReport([{ city: 'c', good: 'lumber', stored: 4, construction_efficiency: 2 }, { city: 'c', good: 'grain', stored: 9 }], 7);
    expect(r.convertible_points).toBe(8); expect(r.converted_reserve).toBe(7); expect(r.lines).toHaveLength(1); expect(r.lines[0].availability).toBe('unknown');
  });
});
