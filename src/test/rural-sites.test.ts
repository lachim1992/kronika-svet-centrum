import { describe, it, expect } from 'vitest';
import { parcelProducers, type EconomicParcel } from '../../supabase/functions/_shared/parcelEconomy';
import { templateSiteRole, parcelTransport, depositKey, FOOTPATH_FACTOR, siteCapacity } from '../../supabase/functions/_shared/ruralSites';
import { RECIPES } from '../../supabase/functions/_shared/productionCatalog';

const recipes = new Map(RECIPES.map(r => [r.key, { recipe_key:r.key, output_good_key:r.output, output_quantity:r.qty, labor_cost:1, input_items:[] }]));
const terrain = [{q:0,r:0,biome_family:'forest',is_passable:true},{q:1,r:0,biome_family:'forest',is_passable:true},{q:2,r:0,biome_family:'hills',is_passable:true}];
const parcel = (id:string, x=0, sub='forest_floor', kind:string|null='worked'): EconomicParcel & {claim_kind:string|null} => ({id,grid_x:x,grid_y:0,parcel_index:0,sub_biome:sub,buildable:true,status:'claimed',city_id:'P',owner_player:'Player',capacity_slots:2,claim_kind:kind});
const city = {id:'P',owner:'Player',cell:'0,0'};
const timber = (ps:any[], ctx:any) => parcelProducers(ps,terrain,[city],recipes,1,{},ctx).filter(p=>p.recipe.key==='fell_timber');

describe('rural sites', () => {
  it('extraction templates are rural, processors urban', () => {
    for (const k of [['fell_timber'],['quarry_stone'],['mine_iron'],['harvest_wheat','harvest_barley','herd_cattle'],['harvest_grapes'],['catch_fish'],['harvest_rice'],['cut_peat']]) expect(templateSiteRole(k)).toBe('rural');
    for (const k of [['saw_timber'],['cut_stone'],['smelt_iron'],['mill_grain'],['bake_staples'],['press_wine'],[]]) expect(templateSiteRole(k)).toBe('urban');
  });
  it('a rural camp replaces the natural timber source — one producer, never two', () => {
    const base = timber([parcel('a')], {roads:[]});
    const built = timber([parcel('a')], {roads:[], sites:[{parcelId:'a',recipeKeys:['fell_timber'],level:1,owner:'Player'}]});
    expect(base).toHaveLength(1); expect(built).toHaveLength(1);
    expect(built[0].id).toBe(base[0].id);
    expect(built[0].capacity).toBeCloseTo(Math.max(siteCapacity('fell_timber',1), base[0].capacity));
  });
  it('a foreign realm site on my parcel is ignored', () => {
    expect(timber([parcel('a')], {roads:[], sites:[{parcelId:'a',recipeKeys:['fell_timber'],level:3,owner:'AI'}]})[0].capacity)
      .toBeCloseTo(timber([parcel('a')], {roads:[]})[0].capacity);
  });
  it('mine needs a confirmed iron deposit; no ore from ordinary rock', () => {
    const ps=[parcel('u',0,'clearing',null),parcel('r',1,'clearing'),parcel('m',2,'rocky_slope')];
    const site={parcelId:'m',recipeKeys:['mine_iron'],level:1,owner:'Player'};
    const roads=[{from:'0,0',to:'1,0'},{from:'1,0',to:'2,0'}];
    const ore=(deposits:Set<string>)=>parcelProducers(ps,terrain,[city],recipes,1,{},{sites:[site],roads,deposits}).filter(p=>p.recipe.key==='mine_iron');
    expect(ore(new Set())).toHaveLength(0);
    expect(ore(new Set([depositKey('Player',2,0,'gold')]))).toHaveLength(0);
    expect(ore(new Set([depositKey('Player',2,0,'iron')]))[0].capacity).toBeGreaterThan(0);
    expect(ore(new Set([depositKey('AI',2,0,'iron')]))).toHaveLength(0);
  });
  it('roads gate bulk freight: local full, adjacent footpath fraction, road full, far zero', () => {
    expect(parcelTransport('0,0','0,0',[]).factor).toBe(1);
    expect(parcelTransport('1,0','0,0',[]).factor).toBe(FOOTPATH_FACTOR);
    expect(parcelTransport('2,0','0,0',[]).factor).toBe(0);
    expect(parcelTransport('2,0','0,0',[{from:'0,0',to:'1,0'},{from:'1,0',to:'2,0'}])).toEqual({factor:1,mode:'road'});
    const ps=[parcel('u',0,'clearing',null),parcel('a',1)];
    const noRoad=timber(ps,{roads:[]}).find(p=>p.parcel?.id==='a')!, road=timber(ps,{roads:[{from:'0,0',to:'1,0'}]}).find(p=>p.parcel?.id==='a')!;
    expect(noRoad.capacity).toBeCloseTo(road.capacity*FOOTPATH_FACTOR);
    // reservoir is the physical stock, unaffected by haulage; repeated runs are identical
    expect((noRoad.parcel as any).reservoir).toBe((road.parcel as any).reservoir);
    expect(timber(ps,{roads:[]})).toEqual(timber(ps,{roads:[]}));
  });
  it('subsistence keeps grace without roads', () => {
    const ps=[parcel('u',0,'clearing',null),parcel('a',1)];
    const food=(roads:any[])=>parcelProducers(ps,terrain,[city],recipes,1,{},{roads}).filter(p=>p.parcel?.id==='a'&&p.recipe.key==='hunt_game');
    expect(food([])[0]?.capacity).toBeCloseTo(food([{from:'0,0',to:'1,0'}])[0]?.capacity);
  });
});

import { FREIGHT_RECIPES as FR, parcelTransport as PT } from '../../supabase/functions/_shared/ruralSites';
describe('freight covers all rural goods', () => {
  it('remote grain without road delivers 0, adjacent 25%, roaded full', () => {
    for (const r of ['harvest_wheat','herd_cattle','harvest_rice','catch_fish','cut_peat','fell_timber','mine_iron']) expect(FR.has(r)).toBe(true);
    expect(PT('5,5','3,5',[]).factor).toBe(0);
    expect(PT('4,5','3,5',[]).factor).toBe(0.25);
    expect(PT('5,5','3,5',[{from:'3,5',to:'4,5'},{from:'4,5',to:'5,5'}]).factor).toBe(1);
    expect(FR.has('draw_river_water')).toBe(false);
  });
});

describe('freight uses only own-realm roads', () => {
  it('foreign road gives no access, own road full', () => {
    const roads = [{ from: '3,5', to: '4,5', owner: 'B' }, { from: '4,5', to: '5,5', owner: 'B' }];
    expect(PT('5,5', '3,5', roads, 'A').factor).toBe(0);
    expect(PT('5,5', '3,5', roads, 'B').factor).toBe(1);
  });
});
