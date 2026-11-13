import { describe, it, expect } from 'vitest';
import fixture from './fixtures/jv72o7-macro-geology.json';
import { parcelProducers, parcelClosing, type EconomicParcel } from '../../supabase/functions/_shared/parcelEconomy';
import { depositKey, templateSiteRole, macroReserveKey } from '../../supabase/functions/_shared/ruralSites';
import { RECIPES, GOODS, PRODUCTION_BUILDINGS } from '../../supabase/functions/_shared/productionCatalog';
import { generateMacroDeposits, goldVeinCells, surveyFindings } from '../../supabase/functions/_shared/geology';
import { terrainReason } from '../../supabase/functions/_shared/terrainSuitability';

const recipes = new Map(RECIPES.map(r => [r.key, { recipe_key: r.key, output_good_key: r.output, output_quantity: r.qty, labor_cost: 1, input_items: [] }]));
const hexes = ((fixture as any).tiles ?? fixture) as any[];
const salt = 'test-salt-gold';
const veins = goldVeinCells(salt, hexes.map(h => ({ x: h.x ?? h.grid_x, y: h.y ?? h.grid_y, biome_family: h.biome_family })));
const [vx, vy] = [...veins][0].split(',').map(Number);
const vhex = hexes.find(h => (h.x ?? h.grid_x) === vx && (h.y ?? h.grid_y) === vy);
const truth = generateMacroDeposits(salt, vx, vy, vhex, veins);
const gold = truth.find(d => d.kind === 'gold')!;
const terrain = [{ q: vx, r: vy, grid_x: vx, grid_y: vy, biome_family: 'hills', is_passable: true }];
const parcel = (id: string, idx: number): EconomicParcel => ({ id, grid_x: vx, grid_y: vy, parcel_index: idx, sub_biome: 'rocky_slope', buildable: true, status: 'claimed', city_id: 'C', owner_player: 'Player', capacity_slots: 2 });
const city = { id: 'C', owner: 'Player', cell: `${vx},${vy}` };
const run = (sites: string[], prior: any = {}, deposits = new Set([depositKey('Player', vx, vy, 'gold')]), roads: any[] = [], c = city) =>
  parcelProducers(sites.map((id, i) => parcel(id, i)), terrain, [c], recipes, 1, prior,
    { sites: sites.map(id => ({ parcelId: id, recipeKeys: ['mine_gold'], level: 3, owner: 'Player' })), roads, deposits,
      reserves: new Map([[`${vx},${vy}|gold`, { reserve: gold.reserve!, grade: gold.grade }]]) }).filter(p => p.recipe.key === 'mine_gold');

describe('gold mining chain on the real JV72O7 layout', () => {
  it('survey finds a real minable gold vein in hills, hidden from level-1 survey grade', () => {
    expect(vhex.biome_family).toBe('hills');
    expect(gold.good).toBe('gold_ore'); expect(gold.implemented).toBe(true); expect(gold.reserve).toBeGreaterThan(0);
    const hint = surveyFindings(truth, 1).find((f: any) => f.kind === 'gold') as any;
    if (hint) expect(hint.reserve).toBeUndefined();
  });
  it('catalogue: gold ore → gold ingot, a dedicated rural mine and urban refinery; generic mine has no gold', () => {
    expect(RECIPES.find(r => r.key === 'mine_gold')!.output).toBe('gold_ore');
    const refine = RECIPES.find(r => r.key === 'refine_gold')!;
    expect(refine.output).toBe('gold_ingot'); expect(refine.inputs.map(i => i.good)).toEqual(['gold_ore', 'charcoal']);
    expect(GOODS.find(g => g.key === 'gold_ingot')!.finalUse).toBe(false);
    expect(PRODUCTION_BUILDINGS.find(b => b.name === 'Důl')!.levels.flat()).not.toContain('mine_gold');
    expect(templateSiteRole(['mine_gold'])).toBe('rural'); expect(templateSiteRole(['refine_gold'])).toBe('urban');
    expect(terrainReason(['mine_gold'], 'fertile_flat')).not.toBeNull(); expect(terrainReason(['mine_gold'], 'rocky_slope')).toBeNull();
  });
  it('unconfirmed or foreign survey: no gold source; confirmed: one stable source producing gold_ore, never iron', () => {
    expect(run(['m1'], {}, new Set())).toHaveLength(0);
    expect(run(['m1'], {}, new Set([depositKey('AI', vx, vy, 'gold')]))).toHaveLength(0);
    const [p] = run(['m1']);
    expect(p.id).toBe('parcel:m1:mine_gold'); expect(p.recipe.good).toBe('gold_ore'); expect(p.capacity).toBeGreaterThan(0);
  });
  it('remote mine without road delivers nothing', () => {
    expect(run(['m1'], {}, undefined, [], { ...city, cell: `${vx + 3},${vy}` })).toHaveLength(0);
  });
  it('two mines share one finite reserve; closing never regrows and never exceeds the deposit', () => {
    const tiny = { [macroReserveKey(vx, vy, 'gold')]: 0.5 };
    const both = run(['m1', 'm2'], tiny);
    expect(both.reduce((a, p) => a + p.capacity, 0)).toBeLessThanOrEqual(0.5 + 1e-9);
    const close = parcelClosing(both, both.map(p => ({ producer: p.id, realized: p.capacity })));
    expect(close[macroReserveKey(vx, vy, 'gold')]).toBeCloseTo(0);
    expect(run(['m1', 'm2'], close)).toHaveLength(0);
    // repeated preview from the same committed state is identical (no hidden decrement)
    expect(run(['m1', 'm2'], tiny)).toEqual(both);
  });
});
